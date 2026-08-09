import type { ContentItem } from "@/lib/content/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant } from "@/lib/variants/types";

import type { RecurringScheduleRule, ScheduledPost } from "./types";

/**
 * Schedule data access.
 *
 * Reads only. Nothing here executes a schedule, because nothing executes a
 * schedule anywhere in this product — these rows are read by the calendar and
 * by the dashboard, and by nothing else.
 */

export interface ScheduleEntry {
  post: ScheduledPost;
  variant: PlatformVariant;
  item: ContentItem;
}

async function ownerId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Every scheduled post with the variant and content item behind it.
 *
 * Joined in three batched queries so the calendar can render a month without
 * a query per entry.
 */
export async function listScheduleEntries(): Promise<ScheduleEntry[]> {
  const supabase = await createSupabaseServerClient();
  const owner = await ownerId();
  if (!owner) {
    return [];
  }

  const { data: postRows } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", owner)
    .order("scheduled_for", { ascending: true });

  const posts = (postRows ?? []) as ScheduledPost[];
  if (posts.length === 0) {
    return [];
  }

  const { data: variantRows } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("owner_id", owner)
    .in(
      "id",
      posts.map((post) => post.platform_variant_id),
    );

  const variants = (variantRows ?? []) as PlatformVariant[];
  const variantsById = new Map(variants.map((v) => [v.id, v]));

  const itemIds = [...new Set(variants.map((v) => v.content_item_id))];
  const { data: itemRows } = await supabase
    .from("content_items")
    .select("*")
    .eq("owner_id", owner)
    .in("id", itemIds);

  const itemsById = new Map(
    ((itemRows ?? []) as ContentItem[]).map((item) => [item.id, item]),
  );

  const entries: ScheduleEntry[] = [];
  for (const post of posts) {
    const variant = variantsById.get(post.platform_variant_id);
    const item = variant ? itemsById.get(variant.content_item_id) : undefined;
    if (variant && item) {
      entries.push({ post, variant, item });
    }
  }
  return entries;
}

/** Active schedules from now onwards, soonest first. */
export function upcomingEntries(
  entries: ScheduleEntry[],
  from: Date,
  limit = 5,
): ScheduleEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.post.status === "scheduled" &&
        new Date(entry.post.scheduled_for).getTime() >= from.getTime(),
    )
    .slice(0, limit);
}

export async function listRecurringRules(): Promise<RecurringScheduleRule[]> {
  const supabase = await createSupabaseServerClient();
  const owner = await ownerId();
  if (!owner) {
    return [];
  }

  const { data, error } = await supabase
    .from("recurring_schedule_rules")
    .select("*")
    .eq("owner_id", owner)
    .order("day_of_week", { ascending: true })
    .order("local_time", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as RecurringScheduleRule[];
}

/** Active schedules for one variant. */
export async function listSchedulesForVariant(
  variantId: string,
): Promise<ScheduledPost[]> {
  const supabase = await createSupabaseServerClient();
  const owner = await ownerId();
  if (!owner) {
    return [];
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", owner)
    .eq("platform_variant_id", variantId)
    .order("scheduled_for", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as ScheduledPost[];
}

/** Schedules for several variants at once, keyed by variant id. */
export async function schedulesByVariant(
  variantIds: string[],
): Promise<Map<string, ScheduledPost[]>> {
  const result = new Map<string, ScheduledPost[]>();
  if (variantIds.length === 0) {
    return result;
  }

  const supabase = await createSupabaseServerClient();
  const owner = await ownerId();
  if (!owner) {
    return result;
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", owner)
    .in("platform_variant_id", variantIds);

  if (error) {
    return result;
  }

  for (const post of (data ?? []) as ScheduledPost[]) {
    const list = result.get(post.platform_variant_id) ?? [];
    list.push(post);
    result.set(post.platform_variant_id, list);
  }
  return result;
}

/** How many posts are currently scheduled, for the dashboard. */
export async function countScheduledPosts(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const owner = await ownerId();
  if (!owner) {
    return 0;
  }

  const { count, error } = await supabase
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", owner)
    .eq("status", "scheduled");

  if (error) {
    return 0;
  }
  return count ?? 0;
}
