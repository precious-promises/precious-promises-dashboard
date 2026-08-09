import { getServerEnv } from "@/lib/env/server";

import {
  EncryptionError,
  openWithKey,
  parseEncryptionKey,
  sealWithKey,
} from "./envelope";

/**
 * The configured secret store.
 *
 * **Server-only.** This module reads `TOKEN_ENCRYPTION_KEY`, so it must never
 * be imported from a Client Component — `tests/unit/client-secret-boundary.test.ts`
 * enforces that across the whole source tree. The pure cryptography lives in
 * `./envelope`, which reads nothing and is therefore testable without a
 * configured environment and without a real credential.
 *
 * The key is resolved on every call rather than memoised. Reading an
 * environment variable is not the expensive part of AES, and a cached key is a
 * key that survives a rotation it should not have survived.
 */

export interface SecretStore {
  seal(plaintext: string): string;
  open(envelope: string): string;
}

/**
 * The secret store, or `null` when no key is configured.
 *
 * Returning `null` rather than throwing is what lets `next build`, `pnpm test`
 * and CI run on a machine with no credentials: the callers all have to handle
 * "not configured" anyway, because that is the state of a fresh checkout.
 */
export function getSecretStore(): SecretStore | null {
  const { TOKEN_ENCRYPTION_KEY } = getServerEnv();

  if (!TOKEN_ENCRYPTION_KEY) {
    return null;
  }

  let key: Buffer;
  try {
    key = parseEncryptionKey(TOKEN_ENCRYPTION_KEY);
  } catch {
    // A malformed key is the same as no key for the purposes of "can this run":
    // the reason is surfaced by `encryptionProblem` below, which names the
    // variable without quoting its value.
    return null;
  }

  return {
    seal: (plaintext) => sealWithKey(plaintext, key),
    open: (envelope) => openWithKey(envelope, key),
  };
}

/** Whether credentials can be stored and read at all. */
export function isEncryptionConfigured(): boolean {
  return getSecretStore() !== null;
}

/**
 * Why encryption is unavailable, phrased for display.
 *
 * Never includes the key, its length, or any part of it — this string is shown
 * in the interface and written to logs.
 */
export function encryptionProblem(): string | null {
  const { TOKEN_ENCRYPTION_KEY } = getServerEnv();

  if (!TOKEN_ENCRYPTION_KEY) {
    return "No token encryption key is configured, so no account can be connected.";
  }

  try {
    parseEncryptionKey(TOKEN_ENCRYPTION_KEY);
    return null;
  } catch (error) {
    return error instanceof EncryptionError
      ? error.message
      : "The token encryption key is not usable.";
  }
}
