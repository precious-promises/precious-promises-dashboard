// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ENVELOPE_VERSION,
  EncryptionError,
  generateEncryptionKey,
  looksLikeEnvelope,
  openWithKey,
  parseEncryptionKey,
  samePlaintext,
  sealWithKey,
} from "@/lib/crypto/envelope";

/**
 * Token encryption.
 *
 * A refresh token is a long-lived bearer capability: whoever holds one can act
 * as this application against Dave's YouTube channel indefinitely. These tests
 * hold the properties that make storing one defensible — and, just as
 * importantly, hold that no cryptography was written by hand.
 */

const KEY = parseEncryptionKey(generateEncryptionKey());
const SECRET = "1//0gRefreshTokenValueThatMustNeverLeak";

describe("the key", () => {
  it("generates one of the expected length", () => {
    expect(Buffer.from(generateEncryptionKey(), "base64")).toHaveLength(32);
  });

  it("generates a different key every time", () => {
    expect(generateEncryptionKey()).not.toBe(generateEncryptionKey());
  });

  it("refuses a key of the wrong length rather than padding it", () => {
    // Padding or truncating would turn a configuration mistake into a weak
    // cipher that nothing complains about.
    expect(() =>
      parseEncryptionKey(Buffer.alloc(16).toString("base64")),
    ).toThrow(EncryptionError);
  });

  it("refuses an absent key", () => {
    expect(() => parseEncryptionKey(undefined)).toThrow(EncryptionError);
    expect(() => parseEncryptionKey("   ")).toThrow(EncryptionError);
  });

  it("never quotes the key in the error it raises", () => {
    const key = "not-base64-at-all-!!!";
    try {
      parseEncryptionKey(key);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(key);
    }
  });
});

describe("sealing and opening", () => {
  it("round-trips a secret exactly", () => {
    expect(openWithKey(sealWithKey(SECRET, KEY), KEY)).toBe(SECRET);
  });

  it("round-trips non-ASCII text", () => {
    const text = "réfrèsh–token—✝";
    expect(openWithKey(sealWithKey(text, KEY), KEY)).toBe(text);
  });

  it("never contains the plaintext", () => {
    expect(sealWithKey(SECRET, KEY)).not.toContain(SECRET);
    expect(sealWithKey(SECRET, KEY)).not.toContain("RefreshToken");
  });

  it("produces a different ciphertext every time", () => {
    // The IV must be fresh per encryption. Reusing one under GCM leaks the XOR
    // of two plaintexts and can forge tags, so identical output for identical
    // input would be a real failure, not a curiosity.
    expect(sealWithKey(SECRET, KEY)).not.toBe(sealWithKey(SECRET, KEY));
  });

  it("carries a version marker", () => {
    const envelope = sealWithKey(SECRET, KEY);

    expect(envelope.startsWith(`${ENVELOPE_VERSION}.`)).toBe(true);
    expect(looksLikeEnvelope(envelope)).toBe(true);
    expect(envelope.split(".")).toHaveLength(4);
  });

  it("refuses to encrypt an empty value", () => {
    expect(() => sealWithKey("", KEY)).toThrow(EncryptionError);
  });
});

describe("tamper detection", () => {
  it("refuses a ciphertext that was altered", () => {
    const envelope = sealWithKey(SECRET, KEY);
    const [version, iv, tag, ciphertext] = envelope.split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;

    expect(() =>
      openWithKey(
        [version, iv, tag, flipped.toString("base64")].join("."),
        KEY,
      ),
    ).toThrow(EncryptionError);
  });

  it("refuses a ciphertext whose tag was altered", () => {
    const envelope = sealWithKey(SECRET, KEY);
    const [version, iv, tag, ciphertext] = envelope.split(".");
    const flipped = Buffer.from(tag, "base64");
    flipped[0] ^= 0xff;

    expect(() =>
      openWithKey(
        [version, iv, flipped.toString("base64"), ciphertext].join("."),
        KEY,
      ),
    ).toThrow(EncryptionError);
  });

  it("refuses a different key", () => {
    const other = parseEncryptionKey(generateEncryptionKey());

    expect(() => openWithKey(sealWithKey(SECRET, KEY), other)).toThrow(
      EncryptionError,
    );
  });

  it("gives the same message for a wrong key and a tampered value", () => {
    // Distinguishing them would tell an attacker which of the two they
    // achieved.
    const other = parseEncryptionKey(generateEncryptionKey());
    const envelope = sealWithKey(SECRET, KEY);
    const [version, iv, tag, ciphertext] = envelope.split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 0xff;

    let wrongKeyMessage = "";
    let tamperedMessage = "";

    try {
      openWithKey(envelope, other);
    } catch (error) {
      wrongKeyMessage = (error as Error).message;
    }
    try {
      openWithKey(
        [version, iv, tag, flipped.toString("base64")].join("."),
        KEY,
      );
    } catch (error) {
      tamperedMessage = (error as Error).message;
    }

    expect(wrongKeyMessage).toBe(tamperedMessage);
  });

  it("refuses a malformed envelope rather than guessing", () => {
    for (const bad of [
      "",
      "not-an-envelope",
      "v1.only.three",
      `${"a."}b.c.d`,
    ]) {
      expect(() => openWithKey(bad, KEY), bad).toThrow(EncryptionError);
    }
  });

  it("refuses an unknown version", () => {
    const envelope = sealWithKey(SECRET, KEY).replace(/^v1\./, "v9.");

    expect(() => openWithKey(envelope, KEY)).toThrow(/version/i);
    expect(looksLikeEnvelope(envelope)).toBe(false);
  });
});

describe("comparing without revealing", () => {
  it("recognises the same plaintext through different ciphertexts", () => {
    expect(
      samePlaintext(sealWithKey(SECRET, KEY), sealWithKey(SECRET, KEY), KEY),
    ).toBe(true);
  });

  it("distinguishes different plaintexts", () => {
    expect(
      samePlaintext(sealWithKey(SECRET, KEY), sealWithKey("other", KEY), KEY),
    ).toBe(false);
  });

  it("answers false rather than throwing on an unreadable envelope", () => {
    expect(samePlaintext("rubbish", sealWithKey(SECRET, KEY), KEY)).toBe(false);
  });
});

describe("no hand-rolled cryptography", () => {
  const SRC_ROOT = join(process.cwd(), "src");

  function sourceFiles(): string[] {
    return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry) => join(SRC_ROOT, entry));
  }

  /** Comments discuss cryptography; code must not implement it. */
  function codeOnly(contents: string): string {
    return contents
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
  }

  it("uses node:crypto rather than an implementation of its own", () => {
    const envelope = readFileSync(
      join(SRC_ROOT, "lib/crypto/envelope.ts"),
      "utf8",
    );

    expect(envelope).toContain('from "node:crypto"');
    expect(envelope).toContain("aes-256-gcm");
    // A hand-written cipher would show up as bit-twiddling over the plaintext.
    expect(codeOnly(envelope)).not.toMatch(/\^=|charCodeAt|>>>|<<\s*\d/);
  });

  it("uses an authenticated cipher, so tampering is detectable", () => {
    const envelope = readFileSync(
      join(SRC_ROOT, "lib/crypto/envelope.ts"),
      "utf8",
    );

    expect(envelope).toContain("getAuthTag");
    expect(envelope).toContain("setAuthTag");
    expect(envelope).not.toMatch(/aes-\d+-(cbc|ecb)/);
  });

  it("keeps the encryption key out of every client component", () => {
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!/^\s*(["'])use client\1/m.test(contents)) {
        continue;
      }
      expect(contents, `${file} is a client component`).not.toContain(
        "TOKEN_ENCRYPTION_KEY",
      );
      expect(contents, `${file} is a client component`).not.toContain(
        "@/lib/crypto/secrets",
      );
    }
  });
});
