import { z } from "zod";

/**
 * Environment schemas and pure parsers.
 *
 * This module holds validation logic ONLY. It never reads `process.env`, so it
 * is safe to import from tests and from either runtime. The modules that
 * actually read the ambient environment are:
 *
 * - `./public` — client-safe values, may be imported anywhere
 * - `./server` — server-only values, must never reach a client component
 *
 * There is deliberately no barrel (`index.ts`) re-exporting both: a barrel
 * would make it trivially easy to pull server secrets into a client bundle.
 */

/**
 * A `.env` file records an unset variable as an empty string. Treat blank and
 * whitespace-only values as "not provided" so optional variables behave the
 * same whether the key is absent or present-but-empty.
 */
function blankToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalText = z.preprocess(
  blankToUndefined,
  z.string().min(1).optional(),
);

/**
 * Every URL this app stores is either a browser-reachable base URL or an OAuth
 * redirect target, so the scheme is restricted to http/https. Without this,
 * `z.url()` would happily accept things like a `postgres://` connection string.
 */
const HTTP_PROTOCOL = /^https?$/;

const optionalUrl = z.preprocess(
  blankToUndefined,
  z
    .url({
      protocol: HTTP_PROTOCOL,
      error: "must be a valid http(s) URL",
    })
    .optional(),
);

/** Variables that are safe to expose to the browser. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalText,
});

/**
 * Server-only variables. Every integration variable stays optional during
 * Block 2 — none of these integrations are implemented yet, so requiring them
 * would break local development, tests and CI for no benefit. They become
 * required in the block that actually implements the integration.
 */
export const serverEnvSchema = z.object({
  APP_URL: z.preprocess(
    blankToUndefined,
    z.url({
      protocol: HTTP_PROTOCOL,
      error:
        "must be a valid absolute http(s) URL, for example http://localhost:3000",
    }),
  ),

  // The trusted server credential for background work, in Supabase's current
  // form (`sb_secret_…`). It replaces the legacy service role key, is
  // independently rotatable and instantly revocable, and is refused by
  // Supabase in a browser — which the legacy JWT was not. Only the worker
  // reads it, and it never appears in a client bundle.
  SUPABASE_SECRET_KEY: optionalText,

  // Legacy, kept only so an older deployment does not fail validation.
  // Nothing in this codebase reads it. See docs/security.md.
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  TOKEN_ENCRYPTION_KEY: optionalText,

  AI_PROVIDER: optionalText,
  AI_MODEL: optionalText,
  AI_API_KEY: optionalText,

  TRIGGER_SECRET_KEY: optionalText,
  TRIGGER_PROJECT_REF: optionalText,

  META_APP_ID: optionalText,
  META_APP_SECRET: optionalText,
  META_REDIRECT_URI: optionalUrl,

  TIKTOK_CLIENT_KEY: optionalText,
  TIKTOK_CLIENT_SECRET: optionalText,
  TIKTOK_REDIRECT_URI: optionalUrl,

  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GOOGLE_REDIRECT_URI: optionalUrl,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalText,

  ELEVENLABS_API_KEY: optionalText,
  ELEVENLABS_DEFAULT_VOICE_ID: optionalText,

  // Opt-in switch for server-side rendering. Rendering needs a runtime that
  // can run headless Chromium and FFmpeg; a serverless request environment
  // usually cannot, so the capability stays off until the operator says the
  // runtime can carry it.
  RENDER_ENABLED: optionalText,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** A single validation problem, named by variable but never carrying its value. */
export interface EnvIssue {
  variable: string;
  message: string;
}

/**
 * Raised when environment validation fails.
 *
 * The message names the offending variables and describes what is wrong with
 * them. It never includes the received values, because this error is expected
 * to surface in server logs and crash reports where a leaked secret would
 * persist far beyond the incident.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(scope: string, issues: readonly EnvIssue[]) {
    const detail = issues
      .map((issue) => `  - ${issue.variable}: ${issue.message}`)
      .join("\n");
    super(
      `Invalid ${scope} environment configuration:\n${detail}\n` +
        `See .env.example for the expected variables.`,
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function toIssues(error: z.ZodError): EnvIssue[] {
  return error.issues.map((issue) => ({
    variable: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Validate client-safe variables from an arbitrary source object.
 *
 * @throws {EnvValidationError} when validation fails.
 */
export function parsePublicEnv(source: unknown): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError("public", toIssues(result.error));
  }
  return result.data;
}

/**
 * Validate server-only variables from an arbitrary source object.
 *
 * Accepting the source as an argument — rather than reaching for `process.env`
 * directly — is what makes this parser testable without real credentials.
 *
 * @throws {EnvValidationError} when validation fails.
 */
export function parseServerEnv(source: unknown): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError("server", toIssues(result.error));
  }
  return result.data;
}
