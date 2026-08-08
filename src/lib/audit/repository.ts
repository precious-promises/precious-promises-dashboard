import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  sanitiseMetadata,
  type AuditAction,
  type AuditEntityType,
  type AuditEntry,
} from "./types";

/**
 * Writing and reading the audit log.
 *
 * Recording is **best effort and never blocking**: a workflow action that
 * succeeded must not be reported as failed because its log line did not write.
 * The alternative — failing the approval because the audit insert failed —
 * would be worse, and the database enforces the important guarantees anyway.
 */
export async function recordAudit(
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    await supabase.from("audit_log").insert({
      owner_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: sanitiseMetadata(metadata),
    });
  } catch {
    // Deliberately swallowed. See the note above.
  }
}

/** Recent entries for one entity, newest first. */
export async function listAuditForEntity(
  entityType: AuditEntityType,
  entityId: string,
  limit = 20,
): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("owner_id", user.id)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }
  return (data ?? []) as AuditEntry[];
}
