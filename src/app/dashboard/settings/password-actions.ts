"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const passwordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password" })
      .min(1, { error: "Enter your current password" }),
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

    if (value.currentPassword === value.newPassword) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Choose a password different from your current password",
      });
    }
  });

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

export type PasswordFieldErrors = Partial<Record<PasswordField, string>>;

export interface PasswordActionState {
  error?: string;
  notice?: string;
  fieldErrors?: PasswordFieldErrors;
}

/**
 * Change the password for the currently authenticated owner.
 *
 * Password values are used only for this authenticated Supabase Auth request.
 * They are never written to application tables, audit metadata or logs.
 */
export async function changePassword(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: PasswordFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        (field === "currentPassword" ||
          field === "newPassword" ||
          field === "confirmPassword") &&
        fieldErrors[field] === undefined
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
    currentPassword: parsed.data.currentPassword,
  });

  if (error) {
    return {
      error:
        "The password could not be changed. Check your current password and try again.",
    };
  }

  return { notice: "Password changed successfully." };
}
