import { createSupabaseServerClient } from "@/lib/supabase/server";

import { nextRevisionNumber, type ScriptRevision } from "./types";

/**
 * Script revision data access.
 *
 * Runs with the caller's session, so RLS applies to every query. Ownership is
 * read from the session and never accepted as an argument.
 */

async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No authenticated user.");
  }
  return user.id;
}

/** Every revision for an item, newest first. */
export async function listScriptRevisions(
  contentItemId: string,
): Promise<ScriptRevision[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("script_revisions")
    .select("*")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", ownerId)
    .order("revision_number", { ascending: false });

  if (error) {
    throw new Error(`Could not load script revisions: ${error.message}`);
  }
  return (data ?? []) as ScriptRevision[];
}

/** The latest revision, or null when no script exists yet. */
export async function getLatestRevision(
  contentItemId: string,
): Promise<ScriptRevision | null> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("script_revisions")
    .select("*")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", ownerId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as ScriptRevision | null) ?? null;
}

/** The latest revision number for each of several items. */
export async function latestRevisionNumbers(
  contentItemIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (contentItemIds.length === 0) {
    return result;
  }

  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("script_revisions")
    .select("content_item_id, revision_number")
    .eq("owner_id", ownerId)
    .in("content_item_id", contentItemIds);

  if (error) {
    return result;
  }

  for (const row of (data ?? []) as {
    content_item_id: string;
    revision_number: number;
  }[]) {
    const current = result.get(row.content_item_id) ?? 0;
    if (row.revision_number > current) {
      result.set(row.content_item_id, row.revision_number);
    }
  }
  return result;
}

/**
 * The number the next saved revision will take.
 *
 * Derived from the stored latest rather than counting rows, so a deleted
 * revision cannot cause a number to be reused.
 */
export async function nextRevisionNumberFor(
  contentItemId: string,
): Promise<number> {
  const latest = await getLatestRevision(contentItemId);
  return nextRevisionNumber(latest?.revision_number ?? null);
}

/** How many items have at least one script revision. */
export async function countItemsWithScripts(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("script_revisions")
    .select("content_item_id")
    .eq("owner_id", ownerId)
    .limit(1000);

  if (error) {
    return 0;
  }

  const items = new Set(
    (data ?? []).map(
      (row) => (row as { content_item_id: string }).content_item_id,
    ),
  );
  return items.size;
}
