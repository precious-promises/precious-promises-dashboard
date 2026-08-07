import { z } from "zod";

/**
 * Sign-in input validation.
 *
 * This is shape validation only — it never decides whether an account exists
 * or whether the password is correct. Those answers come from Supabase, and
 * are deliberately collapsed into one indistinguishable message by
 * `toSafeAuthErrorMessage`.
 */
export const loginSchema = z.object({
  email: z
    .string({ error: "Enter your email address" })
    .trim()
    .min(1, { error: "Enter your email address" })
    .pipe(z.email({ error: "Enter a valid email address" })),
  password: z
    .string({ error: "Enter your password" })
    .min(1, { error: "Enter your password" }),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Field-level messages, keyed by form field. */
export type LoginFieldErrors = Partial<Record<keyof LoginInput, string>>;

export type LoginParseResult =
  | { success: true; data: LoginInput }
  | { success: false; fieldErrors: LoginFieldErrors };

/**
 * Validate sign-in input without throwing, so the form can render per-field
 * messages rather than a single opaque failure.
 *
 * Never logs or returns the submitted password.
 */
export function parseLoginInput(input: unknown): LoginParseResult {
  const result = loginSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: LoginFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      (field === "email" || field === "password") &&
      fieldErrors[field] === undefined
    ) {
      fieldErrors[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
