import {
  safeError,
  sanitiseErrorMessage,
  type ErrorCategory,
  type SafeError,
} from "@/lib/publishing/errors";

/**
 * Turning a TikTok API failure into something this system can act on.
 *
 * TikTok returns an `error.code` string on every response — including
 * successful ones, where it is `ok` — so the code is the signal, not the HTTP
 * status. An unrecognised code falls back to the status, and an unrecognised
 * status is `unknown`, which is **not** retryable.
 */

export interface TikTokErrorBody {
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

/** TikTok's own error code, or null. `ok` is success and returns null. */
export function tiktokErrorCode(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const code = (body as TikTokErrorBody).error?.code;
  return typeof code === "string" && code !== "ok" ? code : null;
}

/** Whether a response body reports success. */
export function isOk(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  return (body as TikTokErrorBody).error?.code === "ok";
}

/**
 * Map a documented TikTok error code to a category.
 *
 * Returns `null` for anything unrecognised, so the caller falls back to the
 * status rather than to a guess.
 */
export function categoryForTikTokCode(code: string): ErrorCategory | null {
  switch (code) {
    // Try again later.
    case "rate_limit_exceeded":
    case "spam_risk_too_many_posts":
    case "spam_risk_user_banned_from_posting":
      return "provider_rate_limited";
    case "internal_error":
      return "provider_unavailable";

    // The authorisation is gone or insufficient.
    case "access_token_invalid":
    case "scope_not_authorized":
    case "scope_permission_missed":
    case "unauthorized":
      return "provider_permission_revoked";

    // The creator cannot do what was asked.
    case "spam_risk":
    case "reached_active_user_cap":
    case "unaudited_client_can_only_post_to_private_accounts":
      return "invalid_content";

    // The content or settings were rejected.
    case "invalid_param":
    case "privacy_level_option_mismatch":
    case "invalid_privacy_level":
      return "invalid_content";

    case "file_format_check_failed":
    case "duration_check_failed":
    case "frame_rate_check_failed":
    case "picture_size_check_failed":
    case "video_pull_failed":
    case "url_ownership_unverified":
      return "provider_rejected_media";

    default:
      return null;
  }
}

export function categoryForStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403) {
    return "provider_permission_revoked";
  }
  if (status === 404) {
    return "provider_rejected_media";
  }
  if (status === 408) {
    return "provider_timeout";
  }
  if (status === 429) {
    return "provider_rate_limited";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  if (status >= 400) {
    return "invalid_content";
  }
  return "unknown";
}

export function classifyTikTokError(status: number, body: unknown): SafeError {
  const code = tiktokErrorCode(body);
  const category =
    (code === null ? null : categoryForTikTokCode(code)) ??
    categoryForStatus(status);

  const message =
    typeof body === "object" && body !== null
      ? ((body as TikTokErrorBody).error?.message ?? "")
      : "";

  // `log_id` identifies a request and adds nothing the owner can act on, so it
  // is dropped rather than stored.
  const detail = [code, message].filter(Boolean).join(": ");

  return safeError(category, detail === "" ? undefined : detail);
}

export class TikTokApiError extends Error {
  readonly status: number;
  readonly safe: SafeError;
  readonly code: string | null;

  constructor(status: number, body: unknown) {
    const safe = classifyTikTokError(status, body);
    super(sanitiseErrorMessage(safe.message));
    this.name = "TikTokApiError";
    this.status = status;
    this.safe = safe;
    this.code = tiktokErrorCode(body);
  }
}
