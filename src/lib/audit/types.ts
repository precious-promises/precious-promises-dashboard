/**
 * The audit foundation.
 *
 * Workflow actions that change what could reach an audience are written down:
 * who did it, to what, when, and enough context to understand it later. The
 * table has no UPDATE or DELETE policy, so an entry cannot be rewritten.
 *
 * **Never stores secrets.** `sanitiseMetadata` drops anything whose key looks
 * like a credential, so a careless call site cannot put a token in the log —
 * and an audit log is exactly where a leaked secret would persist longest.
 */

export const AUDIT_ACTIONS = [
  "variant_submitted_for_review",
  "variant_approved",
  "variant_rejected",
  "variant_returned_to_draft",
  "approval_invalidated",
  "post_scheduled",
  "schedule_paused",
  "schedule_cancelled",
  "recurring_rule_created",
  "recurring_rule_updated",

  // Stage 6 — publishing infrastructure. Written by the dispatcher, which runs
  // outside a request and therefore outside `recordAudit`; they are listed
  // here so this vocabulary matches the database's constraint exactly.
  "publish_queued",
  "publish_claimed",
  "publish_attempt_started",
  "publish_attempt_failed",
  "publish_attempt_succeeded",
  "publish_blocked",
  "publish_retried",
  "publish_reconciled",

  // Stage 7 — YouTube. Note what is absent: nothing records a token, a session
  // URI or a scope value, because an audit log is exactly where a leaked
  // secret would persist longest.
  "youtube_connected",
  "youtube_reconnected",
  "youtube_disconnected",
  "youtube_upload_started",
  "youtube_upload_completed",
  "youtube_upload_failed",
  "youtube_thumbnail_set",
  "youtube_playlist_added",
  "youtube_processing_updated",

  // Stage 8 — Drive media retrieval and Instagram. Note again what is absent:
  // no token, no Drive access URL, no container access token.
  "drive_connected",
  "drive_disconnected",
  "drive_asset_imported",
  "drive_asset_rejected",
  "instagram_connected",
  "instagram_reconnected",
  "instagram_disconnected",
  "instagram_container_created",
  "instagram_container_finished",
  "instagram_published",
  "instagram_publish_failed",

  // Stage 9 — TikTok. Three of these exist because TikTok has three genuinely
  // different endings, and a log that collapsed them would be the easiest place
  // for this system to appear to have posted something it only drafted:
  // `tiktok_post_completed` is a real post, `tiktok_uploaded_to_draft` is a
  // draft in the creator's app, and `tiktok_manual_post_prepared` never touched
  // TikTok at all. No token, no upload URL and no publish id appears in any of
  // them.
  "tiktok_connected",
  "tiktok_reconnected",
  "tiktok_disconnected",
  "tiktok_upload_started",
  "tiktok_upload_completed",
  "tiktok_processing_updated",
  "tiktok_post_completed",
  "tiktok_post_failed",
  "tiktok_uploaded_to_draft",
  "tiktok_manual_post_prepared",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  variant_submitted_for_review: "Submitted for review",
  variant_approved: "Approved",
  variant_rejected: "Rejected",
  variant_returned_to_draft: "Returned to draft",
  approval_invalidated: "Approval invalidated",
  post_scheduled: "Scheduled",
  schedule_paused: "Schedule paused",
  schedule_cancelled: "Schedule cancelled",
  recurring_rule_created: "Recurring slot created",
  recurring_rule_updated: "Recurring slot updated",

  publish_queued: "Queued for publishing",
  publish_claimed: "Claimed by a worker",
  publish_attempt_started: "Publish attempt started",
  publish_attempt_failed: "Publish attempt failed",
  publish_attempt_succeeded: "Publish attempt succeeded",
  publish_blocked: "Publish refused by the safety gate",
  publish_retried: "Publish retried",
  publish_reconciled: "Publish reconciled with the platform",

  youtube_connected: "YouTube channel connected",
  youtube_reconnected: "YouTube channel reconnected",
  youtube_disconnected: "YouTube channel disconnected",
  youtube_upload_started: "YouTube upload started",
  youtube_upload_completed: "YouTube upload completed",
  youtube_upload_failed: "YouTube upload failed",
  youtube_thumbnail_set: "YouTube thumbnail set",
  youtube_playlist_added: "Added to a YouTube playlist",
  youtube_processing_updated: "YouTube processing status updated",

  drive_connected: "Google Drive connected",
  drive_disconnected: "Google Drive disconnected",
  drive_asset_imported: "Drive file imported as a media asset",
  drive_asset_rejected: "Drive file refused",
  instagram_connected: "Instagram account connected",
  instagram_reconnected: "Instagram account reconnected",
  instagram_disconnected: "Instagram account disconnected",
  instagram_container_created: "Instagram container created",
  instagram_container_finished: "Instagram container finished processing",
  instagram_published: "Published to Instagram",
  instagram_publish_failed: "Instagram publish failed",

  tiktok_connected: "TikTok account connected",
  tiktok_reconnected: "TikTok account reconnected",
  tiktok_disconnected: "TikTok account disconnected",
  tiktok_upload_started: "TikTok upload started",
  tiktok_upload_completed: "TikTok upload completed",
  tiktok_processing_updated: "TikTok processing status updated",
  tiktok_post_completed: "Posted to TikTok",
  tiktok_post_failed: "TikTok post failed",
  tiktok_uploaded_to_draft: "Uploaded to TikTok drafts — not posted",
  tiktok_manual_post_prepared: "Prepared for manual TikTok posting",
};

export const AUDIT_ENTITY_TYPES = [
  "platform_variant",
  "scheduled_post",
  "recurring_schedule_rule",
  "publish_attempt",
  "social_account",
  "media_asset",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export interface AuditEntry {
  id: string;
  owner_id: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Key names that must never appear in an audit entry.
 *
 * Matched as substrings, case-insensitively, so `refreshToken` and
 * `SUPABASE_KEY` are both caught.
 */
const FORBIDDEN_KEY_PATTERN =
  /(token|secret|password|passwd|credential|authorization|cookie|session|(^|[-_])key([-_]|$)|key$)/i;

/**
 * Strip anything that looks like a credential.
 *
 * Values are also truncated: an audit entry is a description, and a caller
 * passing a whole caption into it would turn the log into a second copy of the
 * content with none of the rules that govern the first.
 */
export function sanitiseMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === "string") {
      safe[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
      continue;
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      safe[key] = value;
    }
    // Anything else — objects, functions, undefined — is dropped rather than
    // serialised blindly.
  }

  return safe;
}
