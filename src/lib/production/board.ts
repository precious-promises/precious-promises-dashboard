import { approvalFingerprint } from "@/lib/approvals/fingerprint";
import { approvalSubjectFrom } from "@/lib/approvals/subject";
import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant } from "@/lib/variants/types";
import { youtubeSettingsDigest } from "@/lib/youtube/metadata";
import { loadYouTubeMetadataFor } from "@/lib/youtube/repository";

import { classifyProductionStage, type ProductionStage } from "./stage";

/**
 * The Production Board's data.
 *
 * Every column is **derived**. There is no stored "board position" column and
 * no action that sets one, because a position a human could set would
 * eventually disagree with the records underneath it — and the board would
 * then be showing an opinion rather than the state of the work.
 */

export interface BoardCard {
  item: ContentItem;
  stage: ProductionStage;
  variants: PlatformVariant[];
  hasScript: boolean;
  latestScriptRevision: number | null;
  hasVideo: boolean;
  videoStatus: string | null;
  /** Approvals that still match their content. */
  validApprovals: number;
  /** Approvals whose content has since changed. */
  staleApprovals: number;
  schedules: ScheduledPost[];
}

/**
 * Load every non-archived item with the signals its stage depends on.
 *
 * Batched: one query per table rather than per card.
 */
export async function loadBoard(): Promise<BoardCard[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }
  const owner = user.id;

  const { data: itemRows } = await supabase
    .from("content_items")
    .select("*")
    .eq("owner_id", owner)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  const items = (itemRows ?? []) as ContentItem[];
  if (items.length === 0) {
    return [];
  }

  const itemIds = items.map((item) => item.id);

  const [
    variantsResult,
    scriptsResult,
    videosResult,
    scenesResult,
    mediaResult,
  ] = await Promise.all([
    supabase
      .from("platform_variants")
      .select("*")
      .eq("owner_id", owner)
      .in("content_item_id", itemIds),
    supabase
      .from("script_revisions")
      .select("content_item_id, revision_number")
      .eq("owner_id", owner)
      .in("content_item_id", itemIds),
    supabase
      .from("video_projects")
      .select("id, content_item_id, current_revision, status")
      .eq("owner_id", owner)
      .in("content_item_id", itemIds),
    supabase.from("video_scenes").select("project_id").eq("owner_id", owner),
    supabase
      .from("content_media")
      .select("content_item_id, media_asset_id, purpose, sort_order")
      .in("content_item_id", itemIds),
  ]);

  const variants = (variantsResult.data ?? []) as PlatformVariant[];

  const { data: scheduleRows } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", owner)
    .in(
      "platform_variant_id",
      variants.length > 0 ? variants.map((v) => v.id) : ["none"],
    );

  const schedules = (scheduleRows ?? []) as ScheduledPost[];

  const variantsByItem = new Map<string, PlatformVariant[]>();
  for (const variant of variants) {
    const list = variantsByItem.get(variant.content_item_id) ?? [];
    list.push(variant);
    variantsByItem.set(variant.content_item_id, list);
  }

  const scriptByItem = new Map<string, number>();
  for (const row of (scriptsResult.data ?? []) as {
    content_item_id: string;
    revision_number: number;
  }[]) {
    const current = scriptByItem.get(row.content_item_id) ?? 0;
    if (row.revision_number > current) {
      scriptByItem.set(row.content_item_id, row.revision_number);
    }
  }

  const sceneCounts = new Map<string, number>();
  for (const scene of (scenesResult.data ?? []) as { project_id: string }[]) {
    sceneCounts.set(
      scene.project_id,
      (sceneCounts.get(scene.project_id) ?? 0) + 1,
    );
  }

  const videoByItem = new Map<
    string,
    { id: string; current_revision: number; status: string; sceneCount: number }
  >();
  for (const video of (videosResult.data ?? []) as {
    id: string;
    content_item_id: string;
    current_revision: number;
    status: string;
  }[]) {
    if (video.status === "archived" || videoByItem.has(video.content_item_id)) {
      continue;
    }
    videoByItem.set(video.content_item_id, {
      ...video,
      sceneCount: sceneCounts.get(video.id) ?? 0,
    });
  }

  const mediaByItem = new Map<
    string,
    { mediaAssetId: string; purpose: string; sortOrder: number }[]
  >();
  for (const row of (mediaResult.data ?? []) as {
    content_item_id: string;
    media_asset_id: string;
    purpose: string;
    sort_order: number;
  }[]) {
    const list = mediaByItem.get(row.content_item_id) ?? [];
    list.push({
      mediaAssetId: row.media_asset_id,
      purpose: row.purpose,
      sortOrder: row.sort_order,
    });
    mediaByItem.set(row.content_item_id, list);
  }

  const schedulesByVariant = new Map<string, ScheduledPost[]>();
  for (const post of schedules) {
    const list = schedulesByVariant.get(post.platform_variant_id) ?? [];
    list.push(post);
    schedulesByVariant.set(post.platform_variant_id, list);
  }

  // The board decides whether each approval is still valid, so it must
  // recompute the same fingerprint the Approval Queue does — including the
  // platform's own settings. Loaded once here rather than per row.
  const youtubeMetadata = await loadYouTubeMetadataFor(
    variants.filter((v) => v.platform === "youtube").map((v) => v.id),
  );

  return items.map((item) => {
    const itemVariants = variantsByItem.get(item.id) ?? [];
    const video = videoByItem.get(item.id) ?? null;
    const media = mediaByItem.get(item.id) ?? [];
    const hasVideo = video !== null && video.sceneCount > 0;

    let validApprovals = 0;
    let staleApprovals = 0;
    const itemSchedules: ScheduledPost[] = [];

    for (const variant of itemVariants) {
      itemSchedules.push(...(schedulesByVariant.get(variant.id) ?? []));

      if (variant.review_state !== "approved") {
        continue;
      }

      const fingerprint = approvalFingerprint(
        approvalSubjectFrom(
          variant,
          item,
          video
            ? { id: video.id, current_revision: video.current_revision }
            : null,
          media,
          youtubeSettingsDigest(youtubeMetadata.get(variant.id) ?? null),
        ),
      );

      if (variant.approval_hash === fingerprint) {
        validApprovals += 1;
      } else {
        staleApprovals += 1;
      }
    }

    const hasActiveSchedule = itemSchedules.some(
      (post) => post.status === "scheduled",
    );

    return {
      item,
      stage: classifyProductionStage(item, {
        hasScript: scriptByItem.has(item.id),
        hasVariantReadyForReview: itemVariants.some(
          (variant) => variant.review_state === "ready_for_review",
        ),
        hasVideo,
        hasValidApproval: validApprovals > 0,
        hasActiveSchedule,
      }),
      variants: itemVariants,
      hasScript: scriptByItem.has(item.id),
      latestScriptRevision: scriptByItem.get(item.id) ?? null,
      hasVideo,
      videoStatus: video?.status ?? null,
      validApprovals,
      staleApprovals,
      schedules: itemSchedules,
    };
  });
}

/** Cards grouped into their board column. */
export function groupByStage(
  cards: BoardCard[],
): Map<ProductionStage, BoardCard[]> {
  const grouped = new Map<ProductionStage, BoardCard[]>();
  for (const card of cards) {
    const list = grouped.get(card.stage) ?? [];
    list.push(card);
    grouped.set(card.stage, list);
  }
  return grouped;
}
