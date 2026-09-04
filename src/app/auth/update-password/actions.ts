"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const recoveryPasswordSchema = z
  .object({
    newPassword: z
      .string({ error: "Enter a new password" })
      .min(8, { error: "Use at least 8 characters" })
      .max(128, { error: "Use no more than 128 characters" }),
    confirmPassword: z
      .string({ error: "Confirm your new password" })
      .min(1, { error: "Confirm your new password" }),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The new passwords do not match",
      });
    }
  });

export interface RecoveryPasswordState {
  error?: string;
  notice?: string;
  fieldErrors?: Partial<Record<"newPassword" | "confirmPassword", string>>;
}

/** Set a new password for a user who has an authenticated recovery session. */
export async function updateRecoveredPassword(
  _previous: RecoveryPasswordState,
  formData: FormData,
): Promise<RecoveryPasswordState> {
  const parsed = recoveryPasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: RecoveryPasswordState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "newPassword" || field === "confirmPassword") &&
        fieldErrors?.[field] === undefined
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) {
    return {
      error: "The password could not be updated. Request a new reset link and try again.",
    };
  }

  return { notice: "Password updated successfully. You can now use it to sign in." };
}
