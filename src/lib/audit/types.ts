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
};

export const AUDIT_ENTITY_TYPES = [
  "platform_variant",
  "scheduled_post",
  "recurring_schedule_rule",
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
