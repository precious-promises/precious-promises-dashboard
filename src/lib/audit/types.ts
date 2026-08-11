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
};

export const AUDIT_ENTITY_TYPES = [
  "platform_variant",
  "scheduled_post",
  "recurring_schedule_rule",
  "publish_attempt",
  "social_account",
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
