import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost, ScheduleStatus } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant } from "@/lib/variants/types";

import type { PublishAttempt } from "./types";

/**
 * Publish Queue reads.
 *
 * Uses the caller's own session, so RLS applies — the queue is a view of the
 * owner's records, not a worker surface. Nothing here writes anything, and
 * nothing here can publish.
 */

export interface QueueEntry {
  post: ScheduledPost;
  variant: PlatformVariant;
  item: ContentItem;
  attempts: PublishAttempt[];
}

/** Every scheduled post with its variant, item and attempt history. */
export async function loadPublishQueue(): Promise<QueueEntry[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }
  const owner = user.id;

  const { data: postRows } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", owner)
    .order("scheduled_for", { ascending: true });

  const posts = (postRows ?? []) as ScheduledPost[];
  if (posts.length === 0) {
    return [];
  }

  const [variantsResult, attemptsResult] = await Promise.all([
    supabase
      .from("platform_variants")
      .select("*")
      .eq("owner_id", owner)
      .in(
        "id",
        posts.map((post) => post.platform_variant_id),
      ),
    supabase
      .from("publish_attempts")
      .select("*")
      .eq("owner_id", owner)
      .in(
        "scheduled_post_id",
        posts.map((post) => post.id),
      )
      .order("attempt_number", { ascending: false }),
  ]);

  const variants = (variantsResult.data ?? []) as PlatformVariant[];
  const variantsById = new Map(
    variants.map((variant) => [variant.id, variant]),
  );

  const { data: itemRows } = await supabase
    .from("content_items")
    .select("*")
    .eq("owner_id", owner)
    .in("id", [...new Set(variants.map((variant) => variant.content_item_id))]);

  const itemsById = new Map(
    ((itemRows ?? []) as ContentItem[]).map((item) => [item.id, item]),
  );

  const attemptsByPost = new Map<string, PublishAttempt[]>();
  for (const attempt of (attemptsResult.data ?? []) as PublishAttempt[]) {
    const list = attemptsByPost.get(attempt.scheduled_post_id) ?? [];
    list.push(attempt);
    attemptsByPost.set(attempt.scheduled_post_id, list);
  }

  const entries: QueueEntry[] = [];
  for (const post of posts) {
    const variant = variantsById.get(post.platform_variant_id);
    const item = variant ? itemsById.get(variant.content_item_id) : undefined;

    if (variant && item) {
      entries.push({
        post,
        variant,
        item,
        attempts: attemptsByPost.get(post.id) ?? [],
      });
    }
  }
  return entries;
}

/** The queue's sections, in the order they are shown. */
export const QUEUE_SECTIONS: readonly ScheduleStatus[] = [
  "scheduled",
  "queued",
  "publishing",
  "failed",
  "posted",
];

export function groupQueue(
  entries: QueueEntry[],
): Map<ScheduleStatus, QueueEntry[]> {
  const grouped = new Map<ScheduleStatus, QueueEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.post.status) ?? [];
    list.push(entry);
    grouped.set(entry.post.status, list);
  }
  return grouped;
}

/** Counts for the dashboard, derived from real rows. */
export function queueCounts(entries: QueueEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    counts[entry.post.status] = (counts[entry.post.status] ?? 0) + 1;
  }
  return counts;
}
