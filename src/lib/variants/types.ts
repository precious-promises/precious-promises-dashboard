/**
 * Platform variant vocabulary.
 *
 * A variant is the per-platform wording of a content item. It holds captions
 * and metadata — never Scripture, which stays on `content_items`.
 *
 * Nothing here publishes. `ready_for_review` is a note to a human, not an
 * instruction to a machine.
 */

export const VARIANT_PLATFORMS = ["youtube", "instagram", "tiktok"] as const;
export type VariantPlatform = (typeof VARIANT_PLATFORMS)[number];

export const VARIANT_TYPES = [
  "youtube_short",
  "youtube_video",
  "instagram_reel",
  "instagram_image",
  "instagram_carousel",
  "tiktok_video",
] as const;
export type VariantType = (typeof VARIANT_TYPES)[number];

/**
 * Which variant types belong to which platform.
 *
 * The database enforces the same pairing with a check constraint. Both exist
 * because a mismatched variant would eventually be published to the wrong
 * platform, and that is not a mistake worth leaving to one layer.
 */
export const PLATFORM_VARIANT_TYPES: Record<
  VariantPlatform,
  readonly VariantType[]
> = {
  youtube: ["youtube_short", "youtube_video"],
  instagram: ["instagram_reel", "instagram_image", "instagram_carousel"],
  tiktok: ["tiktok_video"],
};

/**
 * The review states a variant can be in.
 *
 * Stage 5 added `approved` and `rejected`, and only then, because approval is
 * now a real decision with a recorded fingerprint behind it.
 */
export const REVIEW_STATES = [
  "draft",
  "ready_for_review",
  "approved",
  "rejected",
] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/**
 * The states the caption editor may set directly.
 *
 * Approval and rejection are **decisions taken in the Approval Queue**, not
 * values a form may post. Without this split, saving a caption with a
 * hand-edited field could approve it — bypassing every eligibility check and
 * writing no fingerprint.
 */
export const EDITABLE_REVIEW_STATES = ["draft", "ready_for_review"] as const;
export type EditableReviewState = (typeof EDITABLE_REVIEW_STATES)[number];

/** True when the state is one an editor may set on its own. */
export function isEditableReviewState(
  state: ReviewState,
): state is EditableReviewState {
  return (EDITABLE_REVIEW_STATES as readonly ReviewState[]).includes(state);
}

export const PLATFORM_LABELS: Record<VariantPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const VARIANT_TYPE_LABELS: Record<VariantType, string> = {
  youtube_short: "Short",
  youtube_video: "Video",
  instagram_reel: "Reel",
  instagram_image: "Image",
  instagram_carousel: "Carousel",
  tiktok_video: "Video",
};

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  approved: "Approved",
  rejected: "Rejected",
};

export interface PlatformVariant {
  id: string;
  owner_id: string;
  content_item_id: string;
  platform: VariantPlatform;
  variant_type: VariantType;
  title: string | null;
  caption: string | null;
  description: string | null;
  hashtags: string[];
  first_comment: string | null;
  cta: string | null;
  thumbnail_text: string | null;
  review_state: ReviewState;

  // Stage 5 approval metadata. The database refuses an `approved` row without
  // all three, and a `rejected` row without a reason.
  approved_at: string | null;
  approved_by: string | null;
  approval_hash: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;

  created_at: string;
  updated_at: string;
}

/** True when the variant type is valid for the platform. */
export function isVariantTypeForPlatform(
  platform: VariantPlatform,
  variantType: VariantType,
): boolean {
  return PLATFORM_VARIANT_TYPES[platform].includes(variantType);
}

/**
 * Whether a variant may move to `ready_for_review`.
 *
 * There must be something to review. Marking an empty variant ready would put
 * a placeholder in front of a human as though it were work.
 *
 * Note what this does *not* check: platform character limits. Those change,
 * and this codebase does not assert a limit it has not verified against
 * current official documentation — see docs/api-integrations.md.
 */
export function canMarkReadyForReview(variant: {
  // Accepts null (a stored row) or undefined (a parsed form) — both mean the
  // field is empty, and the caller should not have to normalise first.
  title?: string | null;
  caption?: string | null;
  description?: string | null;
}): boolean {
  return [variant.title, variant.caption, variant.description].some(
    (value) => (value ?? "").trim() !== "",
  );
}
