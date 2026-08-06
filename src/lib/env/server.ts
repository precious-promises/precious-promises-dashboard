import { parseServerEnv, type ServerEnv } from "./schema";

/**
 * Server-only environment values.
 *
 * NEVER import this module from a client component, and never re-export it
 * through `./public`. Everything it returns is a server secret or a value that
 * has no business in a browser bundle.
 *
 * Validation is lazy and memoised rather than run at module load. A top-level
 * parse would fail the production build on machines that legitimately have no
 * runtime configuration yet — the build should not need runtime secrets.
 */
let cached: ServerEnv | undefined;

/**
 * Validate and return the server environment.
 *
 * In production this rejects a missing or malformed `APP_URL` the first time
 * it is called.
 *
 * @throws {EnvValidationError} when the server environment is invalid.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Clear the memoised value. Intended for tests. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
