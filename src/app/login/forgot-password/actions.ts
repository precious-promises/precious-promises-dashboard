"use server";

import { z } from "zod";

import { getServerEnv } from "@/lib/env/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetRequestSchema = z.object({
  email: z
    .string({ error: "Enter your email address" })
    .trim()
    .min(1, { error: "Enter your email address" })
    .pipe(z.email({ error: "Enter a valid email address" })),
});

export interface ResetRequestState {
  error?: string;
  notice?: string;
  fieldError?: string;
}

/**
 * Request a Supabase password-recovery email without revealing whether an
 * email address is registered. The submitted address is never stored here.
 */
export async function requestPasswordReset(
  _previous: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      fieldError:
        parsed.error.issues[0]?.message ?? "Enter a valid email address",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { APP_URL } = getServerEnv();
    const redirectTo = `${APP_URL.replace(/\/$/, "")}/auth/confirm?next=/auth/update-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      { redirectTo },
    );

    if (error) {
      return {
        error:
          "Password recovery could not be started. Please try again shortly.",
      };
    }
  } catch {
    return {
      error:
        "Password recovery is temporarily unavailable. Please try again shortly.",
    };
  }

  return {
    notice:
      "If that email belongs to the dashboard owner, a password reset link has been sent.",
  };
}
