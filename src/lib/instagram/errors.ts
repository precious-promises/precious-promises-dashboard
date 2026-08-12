import {
  safeError,
  sanitiseErrorMessage,
  type ErrorCategory,
  type SafeError,
} from "@/lib/publishing/errors";

/**
 * Turning a Meta API failure into something this system can act on.
 *
 * The same two questions as the YouTube classifier: would retrying help, and
 * what can the owner safely be shown?
 *
 * Meta's errors carry a numeric `code` and a `error_subcode`, and the code is
 * a better signal than the HTTP status — a 400 covers both "your caption is
 * too long" and "this access token expired". An unrecognised code falls back
 * to the status, and an unrecognised status is `unknown`, which is **not**
 * retryable. Guessing that an unfamiliar failure is transient is how a post
 * goes out twice.
 */

export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export function metaErrorCode(body: unknown): number | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const code = (body as MetaErrorBody).error?.code;
  return typeof code === "number" ? code : null;
}

/**
 * Map a documented Meta error code to a category.
 *
 * Returns `null` for anything unrecognised so the caller falls back to the
 * status rather than to a guess.
 */
export function categoryForMetaCode(code: number): ErrorCategory | null {
  switch (code) {
    // Rate and throttling.
    case 4: // application request limit reached
    case 17: // user request limit reached
    case 32: // page request limit reached
    case 613: // calls to this api have exceeded the rate limit
      return "provider_rate_limited";

    // Authorisation is gone or was never sufficient.
    case 10: // permission denied
    case 190: // access token expired, revoked, or invalid
    case 200: // permissions error
    case 2500: // cannot query without an access token
      return "provider_permission_revoked";

    // Transient on Meta's side.
    case 1: // unknown, usually transient
    case 2: // service temporarily unavailable
      return "provider_unavailable";

    // The content or the request was rejected.
    case 100: // invalid parameter
    case 9004: // media could not be fetched or is unavailable
    case 36003: // aspect ratio not supported
    case 36001: // invalid image format
      return "invalid_content";

    case 2207026: // video format not supported
    case 2207032: // media could not be created
    case 2207020: // media expired
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

export function classifyInstagramError(
  status: number,
  body: unknown,
): SafeError {
  const code = metaErrorCode(body);
  const category =
    (code === null ? null : categoryForMetaCode(code)) ??
    categoryForStatus(status);

  const message =
    typeof body === "object" && body !== null
      ? ((body as MetaErrorBody).error?.message ?? "")
      : "";

  // `fbtrace_id` is deliberately dropped: it identifies a request, and adds
  // nothing the owner can act on.
  const detail = [code === null ? null : `code ${code}`, message]
    .filter(Boolean)
    .join(": ");

  return safeError(category, detail === "" ? undefined : detail);
}

export class InstagramApiError extends Error {
  readonly status: number;
  readonly safe: SafeError;

  constructor(status: number, body: unknown) {
    const safe = classifyInstagramError(status, body);
    super(sanitiseErrorMessage(safe.message));
    this.name = "InstagramApiError";
    this.status = status;
    this.safe = safe;
  }
}
