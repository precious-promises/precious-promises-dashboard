/**
 * Turning Supabase auth failures into messages that are safe to show a user.
 *
 * Two rules drive everything here:
 *
 * 1. **Do not confirm whether an account exists.** Bad password and unknown
 *    email collapse into one identical message, so the sign-in form cannot be
 *    used to enumerate which addresses have accounts.
 * 2. **Do not leak internals.** Raw Supabase messages can carry request ids,
 *    hostnames and provider detail. They belong in server logs, not in a
 *    rendered page.
 */

/** The single message used for every credential failure. */
export const INVALID_CREDENTIALS_MESSAGE =
  "Those sign-in details were not recognised.";

/** Fallback for anything we have not explicitly classified. */
export const GENERIC_AUTH_ERROR_MESSAGE =
  "Sign-in is unavailable at the moment. Please try again.";

const RATE_LIMITED_MESSAGE =
  "Too many sign-in attempts. Please wait a moment and try again.";

const EMAIL_NOT_CONFIRMED_MESSAGE =
  "This account has not been confirmed yet. Check your email for the confirmation link.";

/** The shape we care about from a Supabase `AuthError`. */
export interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  message?: string | undefined;
}

/**
 * Map an auth failure to a user-facing message.
 *
 * The returned string is always one of the constants in this module — a raw
 * upstream message is never passed through.
 */
export function toSafeAuthErrorMessage(error: AuthErrorLike | null): string {
  if (!error) {
    return GENERIC_AUTH_ERROR_MESSAGE;
  }

  switch (error.code) {
    case "invalid_credentials":
    case "invalid_grant":
    case "user_not_found":
      return INVALID_CREDENTIALS_MESSAGE;
    case "email_not_confirmed":
      return EMAIL_NOT_CONFIRMED_MESSAGE;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return RATE_LIMITED_MESSAGE;
    default:
      break;
  }

  if (error.status === 400 || error.status === 401) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  if (error.status === 429) {
    return RATE_LIMITED_MESSAGE;
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
}
