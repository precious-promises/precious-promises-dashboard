"use server";

import { redirect } from "next/navigation";

import { toSafeAuthErrorMessage } from "@/lib/auth/errors";
import {
  type LoginFieldErrors,
  parseLoginInput,
} from "@/lib/auth/login-schema";
import { DASHBOARD_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  /** Message shown above the form. Never carries upstream error detail. */
  error?: string;
  fieldErrors?: LoginFieldErrors;
}

/**
 * Sign in with email and password.
 *
 * There is no sign-up counterpart: this is a private, single-owner dashboard
 * and accounts are created by the owner in Supabase. See docs/supabase-setup.md.
 */
export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = parseLoginInput({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    // Configuration problems must not surface variable names or values to an
    // anonymous visitor. The thrown SupabaseConfigError is still logged by the
    // runtime for the operator.
    return { error: "Sign-in is not available. Please contact the owner." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: toSafeAuthErrorMessage(error) };
  }

  redirect(DASHBOARD_PATH);
}

/** Sign out and return to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
