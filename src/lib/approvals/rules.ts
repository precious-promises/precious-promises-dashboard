import type { ContentItem, ContentType } from "@/lib/content/types";
import { CONTENT_TYPES } from "@/lib/content/types";
import type { PlatformVariant, ReviewState } from "@/lib/variants/types";
import { canMarkReadyForReview } from "@/lib/variants/types";

/**
 * What makes a platform variant approvable, and what takes approval away.
 *
 * Pure functions, so every rule can be tested exhaustively without a database.
 * The server actions call these; the interface only renders what they return.
 *
 * **Approval is per platform variant.** Nothing in this module can approve two
 * platforms at once — approving the YouTube wording says nothing about the
 * Instagram wording, which is different text that a human has not read.
 */

/**
 * Content types whose publication requires a video.
 *
 * Everything except a still image and a carousel. Approving a Short with no
 * composition behind it would approve an intention, not a thing.
 */
export const VIDEO_CONTENT_TYPES: readonly ContentType[] = CONTENT_TYPES.filter(
  (type) => type !== "instagram_image" && type !== "instagram_carousel",
);

/** Content types whose publication requires at least one image asset. */
export const IMAGE_CONTENT_TYPES: readonly ContentType[] = [
  "instagram_image",
  "instagram_carousel",
];

export function requiresVideo(contentType: ContentType): boolean {
  return VIDEO_CONTENT_TYPES.includes(contentType);
}

export function requiresImage(contentType: ContentType): boolean {
  return IMAGE_CONTENT_TYPES.includes(contentType);
}

export type ApprovalBlockerCode =
  | "item_archived"
  | "not_awaiting_review"
  | "scripture_not_verified"
  | "variant_empty"
  | "missing_video"
  | "missing_image"
  | "platform_settings_incomplete";

export interface ApprovalBlocker {
  code: ApprovalBlockerCode;
  /** Shown to the owner verbatim. Says what to do, not just what is wrong. */
  message: string;
}

export interface ApprovalContext {
  variant: Pick<
    PlatformVariant,
    "review_state" | "title" | "caption" | "description"
  >;
  item: Pick<
    ContentItem,
    | "status"
    | "content_type"
    | "scripture_reference"
    | "scripture_text"
    | "scripture_verification_status"
  >;
  /** A video project exists for this item and has at least one scene. */
  hasVideo: boolean;
  /** How many media assets are attached to the content item. */
  mediaCount: number;
  /**
   * Problems the platform's own module found with this variant's settings.
   *
   * Passed in rather than computed here, so this module stays pure and free of
   * any platform's vocabulary. A YouTube variant with an unanswered
   * made-for-kids declaration cannot be approved — approving it would approve
   * an upload that YouTube would refuse, or worse, one this system would have
   * to answer a legal question on Dave's behalf to send.
   */
  platformProblems?: readonly string[];
}

/**
 * Everything standing between this variant and approval.
 *
 * Returns them all rather than the first, so the owner sees the whole list
 * instead of fixing one thing and discovering another.
 */
export function approvalBlockers(context: ApprovalContext): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  const { variant, item } = context;

  if (item.status === "archived") {
    blockers.push({
      code: "item_archived",
      message: "This content item is archived. Restore it before approving.",
    });
  }

  if (variant.review_state !== "ready_for_review") {
    blockers.push({
      code: "not_awaiting_review",
      message:
        "Only a variant marked ready for review can be approved. Submit it for review first.",
    });
  }

  // The Scripture rule, and the one with the highest stakes: an approved post
  // carrying a verse must carry a verse somebody checked against a source.
  const hasScripture =
    (item.scripture_reference ?? "").trim() !== "" ||
    (item.scripture_text ?? "").trim() !== "";

  if (
    hasScripture &&
    item.scripture_verification_status !== "manually_verified"
  ) {
    blockers.push({
      code: "scripture_not_verified",
      message:
        "The Scripture on this item is not verified. Verify it in the Scripture Studio before approving.",
    });
  }

  if (!canMarkReadyForReview(variant)) {
    blockers.push({
      code: "variant_empty",
      message:
        "This variant has no title, caption or description. There is nothing to approve.",
    });
  }

  if (requiresVideo(item.content_type) && !context.hasVideo) {
    blockers.push({
      code: "missing_video",
      message:
        "This content type is published as a video, and no video project with scenes exists yet.",
    });
  }

  if (requiresImage(item.content_type) && context.mediaCount === 0) {
    blockers.push({
      code: "missing_image",
      message:
        "This content type is published as an image, and no media asset is attached.",
    });
  }

  for (const problem of context.platformProblems ?? []) {
    blockers.push({ code: "platform_settings_incomplete", message: problem });
  }

  return blockers;
}

/** True when nothing blocks approval. */
export function canApproveVariant(context: ApprovalContext): boolean {
  return approvalBlockers(context).length === 0;
}

/**
 * The state an approval falls back to when it is invalidated.
 *
 * `ready_for_review` rather than `draft`: the wording is still finished work
 * awaiting a decision — what changed is that the decision no longer applies.
 * Sending it to `draft` would lose the fact that it was ready.
 */
export const INVALIDATED_REVIEW_STATE: ReviewState = "ready_for_review";

export const APPROVAL_INVALIDATED_REASON =
  "Approval invalidated by content change.";

export type ApprovalValidity = "not_approved" | "valid" | "invalidated";

/**
 * Whether a stored approval still holds.
 *
 * `matchesFingerprint` is computed by the caller, which has the current
 * records; keeping the comparison out of here leaves this function pure and
 * free of `node:crypto`, so it can be used anywhere.
 */
export function approvalValidity(
  variant: Pick<PlatformVariant, "review_state" | "approval_hash">,
  matchesFingerprint: boolean,
): ApprovalValidity {
  if (variant.review_state !== "approved" || variant.approval_hash === null) {
    return "not_approved";
  }
  return matchesFingerprint ? "valid" : "invalidated";
}

/**
 * The column values that undo an approval.
 *
 * Every piece of approval metadata is cleared. Leaving `approved_by` behind
 * would leave a record implying somebody approved what is now stored, and the
 * database refuses the combination anyway.
 */
export function invalidationUpdate(): {
  review_state: ReviewState;
  approved_at: null;
  approved_by: null;
  approval_hash: null;
} {
  return {
    review_state: INVALIDATED_REVIEW_STATE,
    approved_at: null,
    approved_by: null,
    approval_hash: null,
  };
}

/**
 * The permitted review-state moves.
 *
 * Note what is missing: nothing reaches `approved` except from
 * `ready_for_review`, so a draft cannot be approved in one step, and a
 * rejected variant must be edited back into review first.
 */
const REVIEW_TRANSITIONS: Record<ReviewState, readonly ReviewState[]> = {
  draft: ["ready_for_review"],
  ready_for_review: ["approved", "rejected", "draft"],
  approved: ["ready_for_review", "draft"],
  rejected: ["draft"],
};

export function canTransitionReview(
  from: ReviewState,
  to: ReviewState,
): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}
