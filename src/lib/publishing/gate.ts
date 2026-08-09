import { requiresImage, requiresVideo } from "@/lib/approvals/rules";
import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

import { holdsClaim } from "./claim";
import { safeError, type SafeError } from "./errors";

/**
 * The execution-time safety gate.
 *
 * **Every value here must have been reloaded from the database in the same
 * moment the provider is about to be called.** Nothing captured when the job
 * was enqueued may be trusted: minutes or hours pass between scheduling and
 * sending, and in that time the owner may have cancelled it, edited the
 * caption, un-verified the Scripture or deleted the video.
 *
 * The gate is a pure function so every refusal can be tested exhaustively
 * without a database. The worker's only job is to load the state honestly and
 * obey the answer.
 *
 * Checks run in a deliberate order: the cheapest and most absolute first, so a
 * cancelled post is reported as cancelled rather than as a stale approval.
 */

export interface GateInput {
  /** Freshly loaded. `null` means the row no longer exists. */
  post: ScheduledPost | null;
  variant: PlatformVariant | null;
  item: ContentItem | null;
  /** The approval fingerprint recomputed from current records, just now. */
  currentFingerprint: string | null;
  hasVideo: boolean;
  mediaCount: number;
  /** Whether an attempt for this operation has already succeeded. */
  successfulAttemptExists: boolean;
  /** The claim token this worker believes it holds. */
  claimToken: string;
  /** Whether a provider for this platform is connected. */
  providerAvailable: boolean;
  now: Date;
}

export type GateResult =
  { allowed: true } | { allowed: false; error: SafeError };

function refuse(error: SafeError): GateResult {
  return { allowed: false, error };
}

export function evaluatePublishGate(input: GateInput): GateResult {
  const { post, variant, item } = input;

  if (post === null) {
    return refuse(
      safeError("invalid_content", "The scheduled post no longer exists."),
    );
  }

  // Cancellation wins over everything. If the owner cancelled while a job was
  // in flight, that decision is the whole answer.
  if (post.status === "cancelled") {
    return refuse(safeError("schedule_cancelled"));
  }

  if (post.status === "paused") {
    return refuse(safeError("schedule_paused"));
  }

  if (post.status === "posted" || input.successfulAttemptExists) {
    return refuse(safeError("already_published"));
  }

  // Only a claimed job may proceed, and only by the worker holding the claim.
  if (!holdsClaim(post, input.claimToken, input.now)) {
    return refuse(safeError("claim_lost"));
  }

  if (post.status !== "queued" && post.status !== "publishing") {
    return refuse(
      safeError(
        "invalid_content",
        `A post in ${post.status} is not ready to publish.`,
      ),
    );
  }

  if (variant === null) {
    return refuse(
      safeError("invalid_content", "The platform variant no longer exists."),
    );
  }

  if (variant.review_state !== "approved" || variant.approval_hash === null) {
    return refuse(safeError("not_approved"));
  }

  // The two hash checks are different questions. The first asks whether the
  // approval still describes the content; the second asks whether *this
  // schedule* rests on that same approval.
  if (
    input.currentFingerprint === null ||
    input.currentFingerprint !== variant.approval_hash
  ) {
    return refuse(safeError("approval_stale"));
  }

  if (post.approval_hash !== variant.approval_hash) {
    return refuse(
      safeError(
        "approval_stale",
        "This schedule was created against a different approval.",
      ),
    );
  }

  if (item === null) {
    return refuse(
      safeError("invalid_content", "The content item no longer exists."),
    );
  }

  if (item.status === "archived") {
    return refuse(
      safeError("invalid_content", "The content item has been archived."),
    );
  }

  const hasScripture =
    (item.scripture_reference ?? "").trim() !== "" ||
    (item.scripture_text ?? "").trim() !== "";

  if (
    hasScripture &&
    item.scripture_verification_status !== "manually_verified"
  ) {
    return refuse(safeError("scripture_unverified"));
  }

  if (requiresVideo(item.content_type) && !input.hasVideo) {
    return refuse(
      safeError("missing_asset", "The video composition is missing."),
    );
  }

  if (requiresImage(item.content_type) && input.mediaCount === 0) {
    return refuse(safeError("missing_asset", "No media asset is attached."));
  }

  // Last, because it is the one that always fails today: no platform
  // integration exists.
  if (!input.providerAvailable) {
    return refuse(safeError("provider_not_connected"));
  }

  return { allowed: true };
}

/** The checks this gate performs, in order — used by the documentation tests. */
export const GATE_CHECKS = [
  "post_exists",
  "not_cancelled",
  "not_paused",
  "not_already_published",
  "claim_held",
  "status_ready",
  "variant_exists",
  "variant_approved",
  "approval_matches_content",
  "schedule_matches_approval",
  "item_exists",
  "item_not_archived",
  "scripture_verified",
  "required_media_present",
  "provider_available",
] as const;
