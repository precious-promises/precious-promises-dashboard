/**
 * Content domain vocabulary.
 *
 * These arrays are the single source of truth: the database check constraints,
 * the Zod schemas and the UI filters are all derived from them, so a new
 * content type is added in one place plus a migration.
 */

export const CONTENT_TYPES = [
  "youtube_short",
  "youtube_standard_video",
  "youtube_long_video",
  "youtube_sleep_video",
  "youtube_prayer_video",
  "youtube_declaration_video",
  "youtube_scripture_reading",
  "youtube_compilation",
  "instagram_reel",
  "instagram_image",
  "instagram_carousel",
  "tiktok_video",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

/**
 * Stage 2 covers the authoring end of the content lifecycle only.
 *
 * `approved`, `scheduled`, `publishing`, `posted` and `failed` from
 * docs/state-machines.md are deliberately absent: approval and publishing do
 * not exist yet, and offering a status the system cannot honour would let the
 * interface claim something untrue.
 */
export const CONTENT_STATUSES = [
  "draft",
  "ready_for_review",
  "archived",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * Scripture is treated as verified data, never as ordinary text.
 *
 * - `unverified` — entered but nobody has checked it against a source.
 * - `manually_verified` — a human confirmed the wording and reference.
 * - `verification_required` — it *was* verified, then the reference or text
 *   changed, so the earlier confirmation no longer describes what is stored.
 */
export const SCRIPTURE_VERIFICATION_STATUSES = [
  "unverified",
  "manually_verified",
  "verification_required",
] as const;

export type ScriptureVerificationStatus =
  (typeof SCRIPTURE_VERIFICATION_STATUSES)[number];

export const DEFAULT_SCRIPTURE_TRANSLATION = "KJV";

/** Human-facing labels. Keyed so a missing entry is a type error. */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  youtube_short: "YouTube Short",
  youtube_standard_video: "YouTube Standard Video",
  youtube_long_video: "YouTube Long Video",
  youtube_sleep_video: "YouTube Sleep Video",
  youtube_prayer_video: "YouTube Prayer Video",
  youtube_declaration_video: "YouTube Declaration Video",
  youtube_scripture_reading: "YouTube Scripture Reading",
  youtube_compilation: "YouTube Compilation",
  instagram_reel: "Instagram Reel",
  instagram_image: "Instagram Image",
  instagram_carousel: "Instagram Carousel",
  tiktok_video: "TikTok Video",
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  archived: "Archived",
};

export const SCRIPTURE_VERIFICATION_LABELS: Record<
  ScriptureVerificationStatus,
  string
> = {
  unverified: "Unverified",
  manually_verified: "Verified",
  verification_required: "Re-verification required",
};

/** A content item as stored. */
export interface ContentItem {
  id: string;
  owner_id: string;
  title: string;
  content_type: ContentType;
  topic: string | null;
  scripture_reference: string | null;
  scripture_text: string | null;
  scripture_translation: string;
  scripture_verification_status: ScriptureVerificationStatus;
  scripture_verified_at: string | null;
  scripture_verified_by: string | null;
  description: string | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}
