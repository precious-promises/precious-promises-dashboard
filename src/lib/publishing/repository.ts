import type { ContentItem } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import type { ScheduledPost, ScheduleStatus } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildManualPostKit, type ManualPostKit } from "@/lib/tiktok/manual";
import { loadTikTokMetadataFor } from "@/lib/tiktok/repository";
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
  /**
   * Everything needed to post this by hand.
   *
   * Present only for rows genuinely waiting on a manual post — building it for
   * every row would load settings and media for a queue that mostly does not
   * need them.
   */
  manualKit?: ManualPostKit;
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

  // The manual posting kit needs settings and media, so it is loaded only for
  // the rows that are actually waiting on a manual post.
  const manualPosts = posts.filter(
    (post) => post.status === "ready_for_manual_post",
  );
  const manualVariantIds = manualPosts
    .map((post) => variantsById.get(post.platform_variant_id))
    .filter((variant): variant is PlatformVariant => variant !== undefined)
    .filter((variant) => variant.platform === "tiktok")
    .map((variant) => variant.id);

  const tiktokMetadata =
    manualVariantIds.length > 0
      ? await loadTikTokMetadataFor(manualVariantIds)
      : new Map();

  const primaryAssets =
    manualPosts.length > 0
      ? await loadPrimaryAssets(
          supabase,
          owner,
          manualPosts
            .map((post) => variantsById.get(post.platform_variant_id))
            .filter((v): v is PlatformVariant => v !== undefined)
            .map((v) => v.content_item_id),
        )
      : new Map<string, MediaAsset>();

  const entries: QueueEntry[] = [];
  for (const post of posts) {
    const variant = variantsById.get(post.platform_variant_id);
    const item = variant ? itemsById.get(variant.content_item_id) : undefined;

    if (variant && item) {
      const entry: QueueEntry = {
        post,
        variant,
        item,
        attempts: attemptsByPost.get(post.id) ?? [],
      };

      if (
        post.status === "ready_for_manual_post" &&
        variant.platform === "tiktok"
      ) {
        entry.manualKit = buildManualPostKit({
          variant,
          item,
          metadata: tiktokMetadata.get(variant.id) ?? null,
          asset: primaryAssets.get(item.id) ?? null,
        });
      }

      entries.push(entry);
    }
  }
  return entries;
}

/**
 * The primary video asset for each of these content items.
 *
 * Read through the owner's own session, so RLS applies — the queue never uses
 * the worker credential.
 */
async function loadPrimaryAssets(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  owner: string,
  contentItemIds: string[],
): Promise<Map<string, MediaAsset>> {
  if (contentItemIds.length === 0) {
    return new Map();
  }

  const { data: links } = await supabase
    .from("content_media")
    .select("content_item_id, media_asset_id, purpose")
    .in("content_item_id", [...new Set(contentItemIds)])
    .eq("purpose", "primary");

  const rows = (links ?? []) as {
    content_item_id: string;
    media_asset_id: string;
  }[];

  if (rows.length === 0) {
    return new Map();
  }

  const { data: assetRows } = await supabase
    .from("media_assets")
    .select("*")
    .eq("owner_id", owner)
    .in("id", [...new Set(rows.map((row) => row.media_asset_id))]);

  const assetsById = new Map(
    ((assetRows ?? []) as MediaAsset[]).map((asset) => [asset.id, asset]),
  );

  const byItem = new Map<string, MediaAsset>();
  for (const row of rows) {
    const asset = assetsById.get(row.media_asset_id);
    if (asset && !byItem.has(row.content_item_id)) {
      byItem.set(row.content_item_id, asset);
    }
  }
  return byItem;
}

/**
 * The queue's sections, in the order they are shown.
 *
 * The two incomplete outcomes sit **before** `posted`, deliberately. They are
 * where the owner still has something to do, and burying them under a heading
 * that reads like an ending would be the surest way for a video to sit in
 * TikTok's drafts for a week believing itself published.
 *
 * A status missing from this list is a row nobody can see. Both of these were
 * missing until Stage 9 gave them somewhere to appear.
 */
export const QUEUE_SECTIONS: readonly ScheduleStatus[] = [
  "scheduled",
  "queued",
  "publishing",
  "ready_for_manual_post",
  "uploaded_to_platform_draft",
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
