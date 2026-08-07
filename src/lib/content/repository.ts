import { createSupabaseServerClient } from "@/lib/supabase/server";

import { escapeLikePattern, type ContentFilters } from "./filters";
import type { ContentItem, ContentStatus } from "./types";

/**
 * Server-side data access for content.
 *
 * Every function here runs with the caller's session, so RLS applies to each
 * query. There is no service-role client, which means an ownership mistake in
 * this file cannot leak another user's rows — the database refuses.
 *
 * `owner_id` is always read from the session and never accepted as an argument.
 */

export class NotAuthenticatedError extends Error {
  constructor() {
    super("No authenticated user.");
    this.name = "NotAuthenticatedError";
  }
}

/** The authenticated user's id, or throw. */
async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new NotAuthenticatedError();
  }
  return user.id;
}

export async function listContentItems(
  filters: ContentFilters,
): Promise<ContentItem[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  let query = supabase
    .from("content_items")
    .select("*")
    // Redundant with RLS by design: belt and braces, and it keeps the
    // intent visible at the call site.
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (filters.contentType) {
    query = query.eq("content_type", filters.contentType);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.verification) {
    query = query.eq("scripture_verification_status", filters.verification);
  }
  if (filters.topic) {
    query = query.ilike("topic", `%${escapeLikePattern(filters.topic)}%`);
  }
  if (filters.search) {
    const pattern = `%${escapeLikePattern(filters.search)}%`;
    query = query.or(
      `title.ilike.${pattern},scripture_reference.ilike.${pattern},description.ilike.${pattern}`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not load content: ${error.message}`);
  }
  return (data ?? []) as ContentItem[];
}

/** One item, or null when it does not exist or is not the caller's. */
export async function getContentItem(id: string): Promise<ContentItem | null> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load content item: ${error.message}`);
  }
  return (data as ContentItem | null) ?? null;
}

/** Distinct topics the owner has used, for the topic filter. */
export async function listTopics(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("content_items")
    .select("topic")
    .eq("owner_id", ownerId)
    .not("topic", "is", null)
    .limit(500);

  if (error) {
    return [];
  }

  const topics = new Set<string>();
  for (const row of (data ?? []) as { topic: string | null }[]) {
    if (row.topic) {
      topics.add(row.topic);
    }
  }
  return [...topics].sort((a, b) => a.localeCompare(b));
}

export interface ContentCounts {
  total: number;
  draft: number;
  readyForReview: number;
  archived: number;
}

/**
 * Real counts for the dashboard.
 *
 * These replace Stage 1's hardcoded zeros. They are still often zero — but now
 * because the database says so, not because the number was written into the
 * markup.
 */
export async function getContentCounts(): Promise<ContentCounts> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const countFor = async (status?: ContentStatus): Promise<number> => {
    let query = supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    if (status) {
      query = query.eq("status", status);
    }
    const { count, error } = await query;
    return error ? 0 : (count ?? 0);
  };

  const [total, draft, readyForReview, archived] = await Promise.all([
    countFor(),
    countFor("draft"),
    countFor("ready_for_review"),
    countFor("archived"),
  ]);

  return { total, draft, readyForReview, archived };
}

/** Number of media assets the owner has recorded. */
export async function getMediaCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { count, error } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);

  return error ? 0 : (count ?? 0);
}
