import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Publishing vocabulary.
 *
 * Stage 6 builds the machinery that will one day turn an approved schedule
 * into a real post. **It publishes nothing.** No provider exists, so no code
 * path can reach `posted` — and the database refuses `posted` without the
 * platform's own post id, so that is a property of the schema rather than a
 * promise about the code.
 */

/** How one attempt against a provider ended. */
export const ATTEMPT_STATUSES = [
  "started",
  "succeeded",
  "failed",
  "blocked",
  "cancelled",
  // Stage 9. The provider finished, and what it finished is not a post: a
  // video in the creator's TikTok drafts, or a post prepared for the owner to
  // make by hand. None of the four above fits — `succeeded` would claim a post
  // nobody made, `failed` would claim the upload did not work, and `blocked`
  // means this system refused, which is the opposite of what happened.
  "incomplete",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const ATTEMPT_STATUS_LABELS: Record<AttemptStatus, string> = {
  started: "Started",
  succeeded: "Succeeded",
  failed: "Failed",
  blocked: "Blocked",
  cancelled: "Cancelled",
  incomplete: "Done, but not posted",
};

/**
 * `blocked` is distinct from `failed` on purpose.
 *
 * A failure is the provider saying no. A block is *this system* saying no —
 * the safety gate refused before anything was sent. Collapsing them would hide
 * the difference between "the platform rejected it" and "we would not let it
 * go", which are opposite problems.
 */
export const NON_SENDING_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  "blocked",
  "cancelled",
];

/**
 * Attempt statuses that did **not** produce a publication.
 *
 * `incomplete` belongs here beside the outright failures for one reason: no
 * audience saw anything. It is a better outcome than a failure and it is not a
 * post, and anywhere that counts publications must treat it as neither.
 */
export const NON_PUBLISHING_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  "started",
  "failed",
  "blocked",
  "cancelled",
  "incomplete",
];

export interface PublishAttempt {
  id: string;
  owner_id: string;
  scheduled_post_id: string;
  platform_variant_id: string;
  platform: VariantPlatform;
  attempt_number: number;
  idempotency_key: string;
  status: AttemptStatus;
  provider: "none" | VariantPlatform;
  retryable: boolean | null;
  safe_error_code: string | null;
  safe_error_message: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

/**
 * How long a worker's claim on a scheduled post lasts.
 *
 * Long enough for a real upload, short enough that a crashed worker's job
 * becomes available again within one dispatcher cycle or two. A lease that
 * never expired would let one crash brick a post permanently.
 */
export const CLAIM_LEASE_SECONDS = 600;

/** How many due posts one dispatcher run will claim. */
export const CLAIM_BATCH_SIZE = 10;

/**
 * The next attempt number for a scheduled post.
 *
 * Numbers start at 1 and only increase, and `(scheduled_post_id,
 * attempt_number)` is unique — so a reused number is a database error rather
 * than a silently overwritten attempt.
 */
export function nextAttemptNumber(latest: number | null): number {
  if (latest === null || !Number.isFinite(latest) || latest < 1) {
    return 1;
  }
  return Math.floor(latest) + 1;
}
