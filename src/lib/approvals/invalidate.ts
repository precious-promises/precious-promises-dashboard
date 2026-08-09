import { recordAudit } from "@/lib/audit/repository";
import type { ContentItem } from "@/lib/content/types";
import { invalidationPause } from "@/lib/schedule/rules";
import type { ScheduledPost } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant } from "@/lib/variants/types";
import { youtubeSettingsDigest } from "@/lib/youtube/metadata";
import { loadYouTubeMetadataFor } from "@/lib/youtube/repository";

import { approvalFingerprint } from "./fingerprint";
import { APPROVAL_INVALIDATED_REASON, invalidationUpdate } from "./rules";
import { approvalSubjectFrom } from "./subject";

/**
 * Approval invalidation, in one place.
 *
 * **The rule:** editing publication-sensitive content withdraws its approval.
 * Not with a warning in the interface — with a write. A caption edited after
 * approval must not still be approved, because the approval attested to
 * wording that no longer exists.
 *
 * This runs from every path that can change what would be published: saving a
 * caption, editing the content item, and changing a video composition. Putting
 * it in the domain layer rather than in each action means a future write path
 * inherits the rule by calling one function, and a reviewer can check the rule
 * in one file.
 *
 * Dependent schedules are **paused, not cancelled**. The owner's intention to
 * post at that time has not changed — only the approval behind it — and
 * cancelling would quietly throw the slot away. Nothing resumes it on its own.
 */

export interface InvalidationResult {
  /** Variants whose approval was withdrawn. */
  invalidatedVariantIds: string[];
  /** Schedules paused as a consequence. */
  pausedScheduleIds: string[];
}

export async function syncApprovalsForItem(
  contentItemId: string,
): Promise<InvalidationResult> {
  const result: InvalidationResult = {
    invalidatedVariantIds: [],
    pausedScheduleIds: [],
  };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return result;
  }
  const owner = user.id;

  const { data: itemRow } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", contentItemId)
    .eq("owner_id", owner)
    .maybeSingle();

  if (!itemRow) {
    return result;
  }
  const item = itemRow as ContentItem;

  const { data: variantRows } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("owner_id", owner)
    .eq("content_item_id", contentItemId)
    .eq("review_state", "approved");

  const approved = (variantRows ?? []) as PlatformVariant[];
  if (approved.length === 0) {
    return result;
  }

  // The same inputs the fingerprint was taken over when it was approved.
  const { data: videoRows } = await supabase
    .from("video_projects")
    .select("id, current_revision, status")
    .eq("owner_id", owner)
    .eq("content_item_id", contentItemId);

  const video =
    (
      (videoRows ?? []) as {
        id: string;
        current_revision: number;
        status: string;
      }[]
    ).find((row) => row.status !== "archived") ?? null;

  const { data: mediaRows } = await supabase
    .from("content_media")
    .select("media_asset_id, purpose, sort_order")
    .eq("content_item_id", contentItemId);

  const mediaSelections = (
    (mediaRows ?? []) as {
      media_asset_id: string;
      purpose: string;
      sort_order: number;
    }[]
  ).map((row) => ({
    mediaAssetId: row.media_asset_id,
    purpose: row.purpose,
    sortOrder: row.sort_order,
  }));

  // YouTube's own settings are part of what was approved, so a changed privacy
  // status or thumbnail invalidates an approval exactly as a changed caption
  // does.
  const youtubeMetadata = await loadYouTubeMetadataFor(
    approved
      .filter((variant) => variant.platform === "youtube")
      .map((v) => v.id),
  );

  for (const variant of approved) {
    const current = approvalFingerprint(
      approvalSubjectFrom(
        variant,
        item,
        video
          ? { id: video.id, current_revision: video.current_revision }
          : null,
        mediaSelections,
        youtubeSettingsDigest(youtubeMetadata.get(variant.id) ?? null),
      ),
    );

    if (variant.approval_hash === current) {
      continue;
    }

    const { error } = await supabase
      .from("platform_variants")
      .update(invalidationUpdate())
      .eq("id", variant.id)
      .eq("owner_id", owner);

    if (error) {
      continue;
    }

    result.invalidatedVariantIds.push(variant.id);
    await recordAudit("approval_invalidated", "platform_variant", variant.id, {
      platform: variant.platform,
      variant_type: variant.variant_type,
      reason: APPROVAL_INVALIDATED_REASON,
    });

    // Anything scheduled on the strength of that approval is now unsafe.
    const { data: postRows } = await supabase
      .from("scheduled_posts")
      .select("*")
      .eq("owner_id", owner)
      .eq("platform_variant_id", variant.id)
      .eq("status", "scheduled");

    for (const post of (postRows ?? []) as ScheduledPost[]) {
      const { error: pauseError } = await supabase
        .from("scheduled_posts")
        .update(invalidationPause(APPROVAL_INVALIDATED_REASON, new Date()))
        .eq("id", post.id)
        .eq("owner_id", owner);

      if (!pauseError) {
        result.pausedScheduleIds.push(post.id);
        await recordAudit("schedule_paused", "scheduled_post", post.id, {
          reason: APPROVAL_INVALIDATED_REASON,
          scheduled_for: post.scheduled_for,
        });
      }
    }
  }

  return result;
}
