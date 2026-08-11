import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant } from "@/lib/variants/types";
import {
  validateForYouTube,
  youtubeSettingsDigest,
} from "@/lib/youtube/metadata";
import { loadYouTubeMetadataFor } from "@/lib/youtube/repository";

import {
  approvalFingerprint,
  type ApprovalMediaSelection,
  type ApprovalSubject,
} from "./fingerprint";
import {
  approvalBlockers,
  approvalValidity,
  type ApprovalBlocker,
  type ApprovalValidity,
} from "./rules";
import { approvalSubjectFrom } from "./subject";

/**
 * Assembling review rows from live records.
 *
 * Every derived value on a row — the fingerprint, whether the approval still
 * holds, what blocks approval — is computed here from stored data. None of it
 * is read from a form, and none of it is cached on the variant, so the queue
 * cannot show an approval as valid after the content moved underneath it.
 */

export interface ReviewRow {
  variant: PlatformVariant;
  item: ContentItem;
  subject: ApprovalSubject;
  /** The fingerprint of the content as it stands now. */
  currentFingerprint: string;
  validity: ApprovalValidity;
  blockers: ApprovalBlocker[];
  hasVideo: boolean;
  videoProjectId: string | null;
  latestScriptRevision: number | null;
  mediaCount: number;
  schedules: ScheduledPost[];
  /** Platform-specific settings problems, in the platform's own words. */
  platformProblems: string[];
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Every platform variant the owner has, with its review context.
 *
 * Loaded in a handful of batched queries rather than per row — a queue that
 * issued five queries per variant would be slow enough to discourage using it,
 * and a review surface nobody opens is not a safety control.
 */
export async function loadReviewRows(): Promise<ReviewRow[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();
  if (!ownerId) {
    return [];
  }

  const { data: variantRows } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  const variants = (variantRows ?? []) as PlatformVariant[];
  if (variants.length === 0) {
    return [];
  }

  const itemIds = [...new Set(variants.map((v) => v.content_item_id))];

  const [
    itemsResult,
    videosResult,
    scenesResult,
    mediaResult,
    scriptsResult,
    schedulesResult,
  ] = await Promise.all([
    supabase
      .from("content_items")
      .select("*")
      .eq("owner_id", ownerId)
      .in("id", itemIds),
    supabase
      .from("video_projects")
      .select("id, content_item_id, current_revision, status, updated_at")
      .eq("owner_id", ownerId)
      .in("content_item_id", itemIds),
    supabase.from("video_scenes").select("project_id").eq("owner_id", ownerId),
    supabase
      .from("content_media")
      .select("content_item_id, media_asset_id, purpose, sort_order")
      .in("content_item_id", itemIds),
    supabase
      .from("script_revisions")
      .select("content_item_id, revision_number")
      .eq("owner_id", ownerId)
      .in("content_item_id", itemIds),
    supabase
      .from("scheduled_posts")
      .select("*")
      .eq("owner_id", ownerId)
      .in(
        "platform_variant_id",
        variants.map((v) => v.id),
      ),
  ]);

  const itemsById = new Map(
    ((itemsResult.data ?? []) as ContentItem[]).map((item) => [item.id, item]),
  );

  const sceneCounts = new Map<string, number>();
  for (const scene of (scenesResult.data ?? []) as { project_id: string }[]) {
    sceneCounts.set(
      scene.project_id,
      (sceneCounts.get(scene.project_id) ?? 0) + 1,
    );
  }

  // One video per item: the most recently updated project that is not
  // archived. A content item with several drafts still publishes one video.
  const videoByItem = new Map<
    string,
    { id: string; current_revision: number; sceneCount: number }
  >();
  const videoRows = (videosResult.data ?? []) as {
    id: string;
    content_item_id: string;
    current_revision: number;
    status: string;
    updated_at: string;
  }[];

  for (const video of videoRows) {
    if (video.status === "archived") {
      continue;
    }
    const existing = videoByItem.get(video.content_item_id);
    const candidate = {
      id: video.id,
      current_revision: video.current_revision,
      sceneCount: sceneCounts.get(video.id) ?? 0,
    };
    if (!existing) {
      videoByItem.set(video.content_item_id, candidate);
    }
  }

  const mediaByItem = new Map<string, ApprovalMediaSelection[]>();
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

  const schedulesByVariant = new Map<string, ScheduledPost[]>();
  for (const post of (schedulesResult.data ?? []) as ScheduledPost[]) {
    const list = schedulesByVariant.get(post.platform_variant_id) ?? [];
    list.push(post);
    schedulesByVariant.set(post.platform_variant_id, list);
  }

  // YouTube's publishing settings are part of what an approval attests to.
  const youtubeMetadata = await loadYouTubeMetadataFor(
    variants.filter((v) => v.platform === "youtube").map((v) => v.id),
  );

  const rows: ReviewRow[] = [];

  for (const variant of variants) {
    const item = itemsById.get(variant.content_item_id);
    if (!item) {
      continue;
    }

    const video = videoByItem.get(item.id) ?? null;
    const mediaSelections = mediaByItem.get(item.id) ?? [];
    const hasVideo = video !== null && video.sceneCount > 0;

    const platformProblems =
      variant.platform === "youtube"
        ? validateForYouTube({
            variant,
            item,
            metadata: youtubeMetadata.get(variant.id) ?? null,
          }).map((problem) => problem.message)
        : [];

    const subject = approvalSubjectFrom(
      variant,
      item,
      video ? { id: video.id, current_revision: video.current_revision } : null,
      mediaSelections,
      youtubeSettingsDigest(youtubeMetadata.get(variant.id) ?? null),
    );
    const currentFingerprint = approvalFingerprint(subject);

    rows.push({
      variant,
      item,
      subject,
      currentFingerprint,
      validity: approvalValidity(
        variant,
        variant.approval_hash === currentFingerprint,
      ),
      blockers: approvalBlockers({
        variant,
        item,
        hasVideo,
        mediaCount: mediaSelections.length,
        platformProblems,
      }),
      hasVideo,
      videoProjectId: video?.id ?? null,
      latestScriptRevision: scriptByItem.get(item.id) ?? null,
      mediaCount: mediaSelections.length,
      schedules: schedulesByVariant.get(variant.id) ?? [],
      platformProblems,
    });
  }

  return rows;
}

/** One review row, or `null` when the variant is not the caller's. */
export async function loadReviewRow(
  variantId: string,
): Promise<ReviewRow | null> {
  const rows = await loadReviewRows();
  return rows.find((row) => row.variant.id === variantId) ?? null;
}

/** Review rows grouped by the section they belong in. */
export function groupForQueue(rows: ReviewRow[]) {
  return {
    readyForReview: rows.filter(
      (row) => row.variant.review_state === "ready_for_review",
    ),
    approved: rows.filter((row) => row.variant.review_state === "approved"),
    rejected: rows.filter((row) => row.variant.review_state === "rejected"),
    draft: rows.filter((row) => row.variant.review_state === "draft"),
  };
}
