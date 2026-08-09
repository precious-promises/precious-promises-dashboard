import {
  safeError,
  sanitiseErrorMessage,
  type ErrorCategory,
  type SafeError,
} from "@/lib/publishing/errors";

/**
 * Turning a YouTube API failure into something this system can act on.
 *
 * Two decisions come out of every failure, and they are different questions:
 *
 * - **Would retrying help?** A rate limit yes; a rejected title never.
 * - **What can the owner read?** A code and a sentence — never the API's own
 *   payload, which carries request parameters and sometimes a token.
 *
 * The classification is driven by the `reason` in Google's error body rather
 * than by the HTTP status alone, because a 403 covers everything from "quota
 * exhausted, try tomorrow" to "this channel is suspended", and those are not
 * the same answer.
 *
 * An unrecognised reason falls through to the status code, and an unrecognised
 * status falls through to `unknown` — which is **not** retryable. Guessing that
 * an unfamiliar failure is transient is how a video gets uploaded twice.
 */

/** The parts of a Google API error body this code reads. */
export interface GoogleApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: { domain?: string; reason?: string; message?: string }[];
  };
}

/** Pull the first documented `reason` out of an error body, if there is one. */
export function reasonFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const error = (body as GoogleApiErrorBody).error;
  const reason = error?.errors?.find(
    (entry) => typeof entry.reason === "string" && entry.reason !== "",
  )?.reason;

  return reason ?? null;
}

/**
 * Map a documented YouTube `reason` to a category.
 *
 * The list holds reasons actually documented for the endpoints this
 * application calls — `videos.insert`, `thumbnails.set`,
 * `playlistItems.insert`, `channels.list`. A reason not on this list returns
 * `null` so the caller falls back to the status code rather than to a guess.
 */
export function categoryForReason(reason: string): ErrorCategory | null {
  switch (reason) {
    // Try again later.
    case "rateLimitExceeded":
    case "userRateLimitExceeded":
      return "provider_rate_limited";
    case "backendError":
    case "internalError":
      return "provider_unavailable";

    // Try again tomorrow — but that is still "later", and the daily quota does
    // reset, so this stays retryable rather than being treated as fatal.
    case "quotaExceeded":
    case "uploadLimitExceeded":
      return "provider_rate_limited";

    // The authorisation is gone. Retrying is refused forever until the owner
    // reconnects.
    case "authError":
    case "unauthorized":
    case "forbidden":
    case "youtubeSignupRequired":
    case "accountClosed":
    case "accountSuspended":
      return "provider_permission_revoked";

    // The platform looked at the content and said no. Nothing about retrying
    // changes its mind.
    case "invalidTitle":
    case "invalidDescription":
    case "invalidTags":
    case "invalidCategoryId":
    case "invalidVideoMetadata":
    case "invalidFilename":
    case "defaultLanguageNotSet":
    case "invalidRecordingDetails":
      return "invalid_content";

    case "invalidImage":
    case "mediaBodyRequired":
    case "videoNotFound":
    case "failedPrecondition":
      return "provider_rejected_media";

    default:
      return null;
  }
}

/** Fall back to the HTTP status when the reason is unfamiliar or absent. */
export function categoryForStatus(status: number): ErrorCategory {
  if (status === 401) {
    return "provider_permission_revoked";
  }
  if (status === 403) {
    // A bare 403 with no reason is ambiguous between quota and permission.
    // Permission is the safer reading: it stops rather than retrying.
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

/**
 * Classify a YouTube API failure.
 *
 * The message passed through to `safeError` is Google's `error.message`, which
 * is sanitised on the way — the shared redaction pass strips bearer tokens,
 * keys and JWTs before anything is stored.
 */
export function classifyYouTubeError(status: number, body: unknown): SafeError {
  const reason = reasonFrom(body);
  const category =
    (reason === null ? null : categoryForReason(reason)) ??
    categoryForStatus(status);

  const message =
    typeof body === "object" && body !== null
      ? ((body as GoogleApiErrorBody).error?.message ?? "")
      : "";

  const detail = [reason, message].filter((part) => part).join(": ");

  return safeError(category, detail === "" ? undefined : detail);
}

/**
 * Raised when a YouTube API call fails.
 *
 * Carries the already-classified `SafeError` so the provider does not have to
 * re-derive it, and a message that has been through the same sanitisation as
 * everything else that gets written down.
 */
export class YouTubeApiError extends Error {
  readonly status: number;
  readonly safe: SafeError;

  constructor(status: number, body: unknown) {
    const safe = classifyYouTubeError(status, body);
    super(sanitiseErrorMessage(safe.message));
    this.name = "YouTubeApiError";
    this.status = status;
    this.safe = safe;
  }
}
