import { z } from "zod";

/**
 * Supabase connection configuration.
 *
 * Both values here are browser-safe by design: the project URL and the
 * publishable key are meant to be shipped to the client, and access is
 * constrained by Row Level Security rather than by key secrecy.
 *
 * The service role key is deliberately absent. It bypasses RLS entirely and
 * must never appear in application code — see docs/security.md.
 *
 * `src/lib/env/schema.ts` keeps these variables optional, because the rest of
 * the app (and CI) must run without them. This module is where they become
 * required, and it is only reached when a Supabase client is actually built.
 */

const supabaseConfigSchema = z.object({
  url: z.url({
    protocol: /^https?$/,
    error: "must be a valid http(s) URL, for example https://<ref>.supabase.co",
  }),
  publishableKey: z.string().min(1, { error: "must not be empty" }),
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

/** Maps a config field back to the environment variable that supplies it. */
const VARIABLE_NAMES: Record<keyof SupabaseConfig, string> = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  publishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
};

export interface SupabaseConfigIssue {
  variable: string;
  message: string;
}

/**
 * Raised when Supabase configuration is missing or malformed.
 *
 * Like `EnvValidationError`, this names the offending variable and describes
 * the problem, but never echoes the received value.
 */
export class SupabaseConfigError extends Error {
  readonly issues: readonly SupabaseConfigIssue[];

  constructor(issues: readonly SupabaseConfigIssue[]) {
    const detail = issues
      .map((issue) => `  - ${issue.variable}: ${issue.message}`)
      .join("\n");
    super(
      `Supabase is not configured correctly:\n${detail}\n` +
        `Copy .env.example to .env.local and fill in the project values. ` +
        `See docs/supabase-setup.md.`,
    );
    this.name = "SupabaseConfigError";
    this.issues = issues;
  }
}

/**
 * Validate Supabase configuration from an arbitrary source object.
 *
 * Taking the source as an argument keeps this testable without real
 * credentials.
 *
 * @throws {SupabaseConfigError} when validation fails.
 */
export function parseSupabaseConfig(source: unknown): SupabaseConfig {
  const result = supabaseConfigSchema.safeParse(source);
  if (!result.success) {
    throw new SupabaseConfigError(
      result.error.issues.map((issue) => {
        const field = issue.path[0] as keyof SupabaseConfig | undefined;
        return {
          variable: field ? (VARIABLE_NAMES[field] ?? String(field)) : "(root)",
          message: issue.message,
        };
      }),
    );
  }
  return result.data;
}

/**
 * Read and validate Supabase configuration from the ambient environment.
 *
 * The keys are written as literal `process.env.X` member accesses so Next.js
 * can inline them into the browser bundle; a dynamic lookup would be undefined
 * on the client.
 *
 * This is called lazily when a client is constructed, never at module load, so
 * that `next build` does not require runtime configuration.
 *
 * @throws {SupabaseConfigError} when the environment is not configured.
 */
export function getSupabaseConfig(): SupabaseConfig {
  return parseSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
