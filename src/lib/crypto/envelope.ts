import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Authenticated encryption for stored secrets.
 *
 * OAuth refresh tokens and resumable upload URIs are long-lived bearer
 * capabilities: whoever holds one can act as this application. They are stored
 * in a database, so the database is not where the security ends.
 *
 * **No cryptography is written here.** This is AES-256-GCM as provided by
 * Node's `node:crypto`, which is OpenSSL. What this module does is the part
 * that is easy to get wrong around a correct primitive: generate a fresh
 * random IV for every encryption, keep the authentication tag, version the
 * output so the format can change later, and refuse rather than guess when
 * anything is off.
 *
 * GCM rather than CBC because it authenticates: a tampered ciphertext fails to
 * decrypt instead of decrypting to something attacker-chosen.
 *
 * ## The envelope format
 *
 * ```
 * v1.<iv base64>.<auth tag base64>.<ciphertext base64>
 * ```
 *
 * The version prefix is not decoration. When a second format is needed —
 * a rotated key, a different cipher — old envelopes must still be readable
 * while new ones are written differently, and an unprefixed blob makes that
 * impossible to do safely.
 *
 * ## The key
 *
 * `TOKEN_ENCRYPTION_KEY` is 32 bytes, base64-encoded. It is read only on the
 * server, never logged, and never included in an error — including the errors
 * raised from here, which say what went wrong without quoting anything.
 */

/** The only format this module writes. Older versions may still be read. */
export const ENVELOPE_VERSION = "v1";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
/** 96 bits, the IV length GCM is specified around. */
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Raised when encryption or decryption cannot proceed.
 *
 * The message describes the problem and never contains a key, a ciphertext or
 * a plaintext — this error is expected to reach logs and crash reports, which
 * outlive the incident that produced them.
 */
export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

/**
 * Decode a base64 key and check its length.
 *
 * A key of the wrong length is a configuration mistake, and silently padding
 * or truncating it would turn that mistake into a weak cipher nobody notices.
 */
export function parseEncryptionKey(encoded: string | undefined): Buffer {
  if (encoded === undefined || encoded.trim() === "") {
    throw new EncryptionError(
      "TOKEN_ENCRYPTION_KEY is not set, so stored credentials cannot be encrypted or read.",
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(encoded.trim(), "base64");
  } catch {
    throw new EncryptionError("TOKEN_ENCRYPTION_KEY is not valid base64.");
  }

  if (key.length !== KEY_BYTES) {
    throw new EncryptionError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes; it decodes to ${key.length}.`,
    );
  }

  return key;
}

/** Generate a key in the expected form. Used by the setup documentation. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/**
 * Encrypt a secret with an explicit key.
 *
 * The key is a parameter rather than something this function reaches for, so
 * the cryptography can be tested exhaustively without a configured
 * environment and without a real credential anywhere near the test.
 */
export function sealWithKey(plaintext: string, key: Buffer): string {
  if (plaintext === "") {
    throw new EncryptionError("Refusing to encrypt an empty value.");
  }

  // A fresh IV per encryption. Reusing one under GCM is catastrophic — it
  // leaks the XOR of two plaintexts and can forge tags — so it is generated
  // here rather than taken from a caller who might hold one still.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * Decrypt an envelope with an explicit key.
 *
 * Throws on a tampered or truncated envelope rather than returning anything:
 * GCM's tag check is the whole point of choosing it, and a caller that could
 * accidentally ignore a failure would throw that away.
 */
export function openWithKey(envelope: string, key: Buffer): string {
  const parts = envelope.split(".");

  if (parts.length !== 4) {
    throw new EncryptionError("The stored value is not a valid envelope.");
  }

  const [version, ivPart, tagPart, ciphertextPart] = parts;

  if (version !== ENVELOPE_VERSION) {
    throw new EncryptionError(
      `Unsupported envelope version: ${sanitiseVersion(version)}.`,
    );
  }

  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const ciphertext = Buffer.from(ciphertextPart, "base64");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new EncryptionError("The stored value is malformed.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Deliberately one message for every failure. Distinguishing "wrong key"
    // from "tampered ciphertext" tells an attacker which of the two they
    // achieved.
    throw new EncryptionError(
      "The stored value could not be decrypted. It may have been tampered with, or the encryption key may have changed.",
    );
  }
}

/** True when a string has the shape of an envelope this module can read. */
export function looksLikeEnvelope(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts[0] === ENVELOPE_VERSION;
}

/**
 * Whether two envelopes hold the same plaintext, without revealing either.
 *
 * Used when deciding whether a refreshed token actually changed. The
 * comparison is constant-time so the answer cannot be extracted a byte at a
 * time by timing.
 */
export function samePlaintext(a: string, b: string, key: Buffer): boolean {
  let left: Buffer;
  let right: Buffer;

  try {
    left = Buffer.from(openWithKey(a, key), "utf8");
    right = Buffer.from(openWithKey(b, key), "utf8");
  } catch {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Keep an unrecognised version marker from carrying anything into a log. */
function sanitiseVersion(version: string): string {
  const cleaned = version.replace(/[^A-Za-z0-9]/g, "");
  return cleaned.slice(0, 8) || "(unreadable)";
}
