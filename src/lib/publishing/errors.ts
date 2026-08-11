/**
 * Error classification and sanitisation.
 *
 * Two jobs, both about honesty:
 *
 * 1. **Deciding whether retrying could possibly help.** Retrying a rejection
 *    is noise; not retrying a timeout loses a post that would have succeeded.
 * 2. **Making sure nothing sensitive is written down.** Provider errors carry
 *    request ids, headers and sometimes credentials. What reaches
 *    `publish_attempts` is a code and a sentence, never a payload.
 *
 * No provider-specific retry counts are set here. Those depend on each
 * platform's published limits, and this codebase does not assert a limit it
 * has not read in that platform's current documentation.
 */

export const ERROR_CATEGORIES = [
  // Trying again later could work.
  "network",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  // Trying again changes nothing until something else changes.
  "not_approved",
  "approval_stale",
  "scripture_unverified",
  "missing_asset",
  // The asset record exists, but nothing can fetch its bytes. Stage 2 stores
  // media as *metadata* — a row describing a file that lives somewhere else —
  // and no storage integration retrieves it. A provider cannot upload a
  // reference.
  "media_source_unavailable",
  "invalid_content",
  "provider_not_connected",
  "provider_permission_revoked",
  "provider_rejected_media",
  "schedule_cancelled",
  "schedule_paused",
  "already_published",
  "claim_lost",
  "unknown",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/**
 * Which categories are worth retrying.
 *
 * Everything not listed here is non-retryable, so a new category is
 * non-retryable until somebody decides otherwise — the safe default, because a
 * wrongly-retried publish can post twice.
 */
export const RETRYABLE_CATEGORIES: readonly ErrorCategory[] = [
  "network",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
];

export function isRetryable(category: ErrorCategory): boolean {
  return RETRYABLE_CATEGORIES.includes(category);
}

export const ERROR_CATEGORY_LABELS: Record<ErrorCategory, string> = {
  network: "Network interruption",
  provider_timeout: "Platform timed out",
  provider_rate_limited: "Platform rate limited the request",
  provider_unavailable: "Platform unavailable",
  not_approved: "Not approved",
  approval_stale: "Approval no longer matches the content",
  scripture_unverified: "Scripture is not verified",
  missing_asset: "A required media asset or composition is missing",
  media_source_unavailable:
    "The media file itself cannot be retrieved, so there is nothing to upload",
  invalid_content: "The content is not valid for this platform",
  provider_not_connected: "No connection to this platform",
  provider_permission_revoked: "Platform permission was revoked",
  provider_rejected_media: "The platform rejected the media",
  schedule_cancelled: "The schedule was cancelled",
  schedule_paused: "The schedule was paused",
  already_published: "This has already been published",
  claim_lost: "Another worker took this job",
  unknown: "Unclassified error",
};

export interface SafeError {
  code: ErrorCategory;
  /** A sentence for the owner. Never a provider payload. */
  message: string;
  retryable: boolean;
}

/**
 * Patterns that must never survive into a stored message.
 *
 * Matched case-insensitively against the whole string, because a provider's
 * error text can embed a token in prose.
 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /bearer\s+[\w.\-]+/gi,
  /\b(sb_secret|sb_publishable|tr_dev|tr_prod)_[\w-]+/gi,
  /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+/g,
  /\b(access|refresh|id)[_-]?token["'\s:=]+[\w.\-]+/gi,
  /\b(api[_-]?key|client[_-]?secret|password)["'\s:=]+[^\s"']+/gi,
  /authorization["'\s:=]+[^\s"']+/gi,
];

/**
 * Reduce anything to a safe, bounded sentence.
 *
 * Redacts before truncating, so a secret cannot survive by sitting past the
 * cut. Returns a fixed sentence for anything that is not a string, rather than
 * serialising an object whose shape nobody has checked.
 */
export function sanitiseErrorMessage(input: unknown): string {
  let text: string;

  if (typeof input === "string") {
    text = input;
  } else if (input instanceof Error) {
    text = input.message;
  } else {
    return "An error was reported without a readable message.";
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }

  text = text.replace(/\s+/g, " ").trim();

  if (text === "") {
    return "An error was reported without a readable message.";
  }
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/** Build a safe error from a category and an optional provider message. */
export function safeError(code: ErrorCategory, detail?: unknown): SafeError {
  const detailText = detail === undefined ? "" : sanitiseErrorMessage(detail);

  return {
    code,
    message:
      detailText === "" || detailText.startsWith("An error was reported")
        ? ERROR_CATEGORY_LABELS[code]
        : `${ERROR_CATEGORY_LABELS[code]}: ${detailText}`,
    retryable: isRetryable(code),
  };
}

/**
 * Classify an unknown throwable.
 *
 * Deliberately conservative: anything unrecognised is `unknown`, which is
 * **not** retryable. Guessing that an unfamiliar error is transient is how a
 * post goes out twice.
 */
export function classifyThrown(error: unknown): SafeError {
  const text = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();

  if (/timeout|timed out|etimedout/.test(text)) {
    return safeError("provider_timeout", error);
  }
  if (
    /econnreset|enotfound|econnrefused|network|socket hang up|fetch failed/.test(
      text,
    )
  ) {
    return safeError("network", error);
  }
  if (/rate limit|too many requests|429/.test(text)) {
    return safeError("provider_rate_limited", error);
  }
  if (/\b(500|502|503|504)\b|service unavailable|bad gateway/.test(text)) {
    return safeError("provider_unavailable", error);
  }

  return safeError("unknown", error);
}
