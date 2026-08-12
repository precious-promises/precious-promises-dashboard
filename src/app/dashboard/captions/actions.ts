"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncApprovalsForItem } from "@/lib/approvals/invalidate";
import { parseVariantForm, variantValuesFrom } from "@/lib/variants/schema";
import type { VariantFieldErrors } from "@/lib/variants/schema";
import { canMarkReadyForReview } from "@/lib/variants/types";
import {
  parseInstagramMetadataForm,
  instagramValuesFrom,
  type InstagramFieldErrors,
} from "@/lib/instagram/schema";
import {
  parseYouTubeMetadataForm,
  youtubeValuesFrom,
  type YouTubeFieldErrors,
} from "@/lib/youtube/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Platform variant write path.
 *
 * **Nothing here publishes.** `ready_for_review` records that the owner
 * considers the wording finished; it does not queue, schedule or send
 * anything, and no integration reads it.
 *
 * The payload carries no Scripture fields, so saving a caption structurally
 * cannot alter the verse on the content item.
 */

export interface VariantActionState {
  error?: string;
  fieldErrors?: VariantFieldErrors;
}

export async function saveVariant(
  _previous: VariantActionState,
  formData: FormData,
): Promise<VariantActionState> {
  const contentItemId = formData.get("content_item_id");
  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }

  const parsed = parseVariantForm(variantValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  if (
    parsed.data.review_state === "ready_for_review" &&
    !canMarkReadyForReview(parsed.data)
  ) {
    return {
      error:
        "Add a title, caption or description before marking this ready for review.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: item } = await supabase
    .from("content_items")
    .select("id")
    .eq("id", contentItemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!item) {
    return { error: "That content item could not be found." };
  }

  // One variant per (item, platform, type): re-saving replaces the draft
  // rather than accumulating duplicates. Captions are working text, unlike
  // scripts, where history is the point.
  const { error } = await supabase.from("platform_variants").upsert(
    {
      ...parsed.data,
      content_item_id: contentItemId,
      owner_id: user.id,
    },
    { onConflict: "content_item_id,platform,variant_type" },
  );

  if (error) {
    return { error: "Could not save this variant. Please try again." };
  }

  // Editing a caption changes what would be published, so any approval it
  // invalidated is withdrawn here and anything scheduled on it is paused. This
  // is a write, not a warning — an edited caption must not stay approved.
  await syncApprovalsForItem(contentItemId);

  revalidatePath("/dashboard/captions");
  revalidatePath(`/dashboard/content/${contentItemId}`);
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/calendar");
  redirect(
    `/dashboard/captions?item=${contentItemId}&platform=${parsed.data.platform}`,
  );
}

export interface YouTubeMetadataActionState {
  error?: string;
  notice?: string;
  fieldErrors?: YouTubeFieldErrors;
}

/**
 * Save the YouTube-specific publishing settings for one variant.
 *
 * These are part of the approval fingerprint — a privacy status, a
 * made-for-kids declaration, a thumbnail and tags all change what an audience
 * sees — so saving them runs the same invalidation as editing a caption. An
 * approval granted before the change no longer describes what would be
 * published, and it is withdrawn here as a write, not flagged as a warning.
 */
export async function saveYouTubeMetadata(
  _previous: YouTubeMetadataActionState,
  formData: FormData,
): Promise<YouTubeMetadataActionState> {
  const variantId = formData.get("platform_variant_id");
  const contentItemId = formData.get("content_item_id");

  if (typeof variantId !== "string" || variantId === "") {
    return { error: "Save the YouTube variant before adding its settings." };
  }
  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }

  const parsed = parseYouTubeMetadataForm(youtubeValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Ownership of the variant is checked before anything is written, and the
  // platform is checked too — YouTube settings on an Instagram variant would
  // be settings nothing could ever read.
  const { data: variant } = await supabase
    .from("platform_variants")
    .select("id, platform")
    .eq("id", variantId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!variant || (variant as { platform: string }).platform !== "youtube") {
    return { error: "That YouTube variant could not be found." };
  }

  const { error } = await supabase.from("youtube_video_metadata").upsert(
    {
      ...parsed.data,
      platform_variant_id: variantId,
      owner_id: user.id,
    },
    { onConflict: "platform_variant_id" },
  );

  if (error) {
    return { error: "Could not save these settings. Please try again." };
  }

  const result = await syncApprovalsForItem(contentItemId);

  revalidatePath("/dashboard/captions");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/production");
  revalidatePath("/dashboard/calendar");

  return {
    notice:
      result.invalidatedVariantIds.length > 0
        ? "Saved. The approval on this variant was withdrawn, because these settings change what would be published."
        : "Saved.",
  };
}

export interface InstagramMetadataActionState {
  error?: string;
  notice?: string;
  fieldErrors?: InstagramFieldErrors;
}

/**
 * Save the Instagram publishing settings for one variant.
 *
 * The media type and cover frame change what an audience sees, so these are
 * part of the approval fingerprint and saving them runs the same invalidation
 * as editing a caption.
 */
export async function saveInstagramMetadata(
  _previous: InstagramMetadataActionState,
  formData: FormData,
): Promise<InstagramMetadataActionState> {
  const variantId = formData.get("platform_variant_id");
  const contentItemId = formData.get("content_item_id");

  if (typeof variantId !== "string" || variantId === "") {
    return { error: "Save the Instagram variant before adding its settings." };
  }
  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }

  const parsed = parseInstagramMetadataForm(instagramValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: variant } = await supabase
    .from("platform_variants")
    .select("id, platform")
    .eq("id", variantId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!variant || (variant as { platform: string }).platform !== "instagram") {
    return { error: "That Instagram variant could not be found." };
  }

  const { error } = await supabase.from("instagram_media_metadata").upsert(
    {
      ...parsed.data,
      platform_variant_id: variantId,
      owner_id: user.id,
    },
    { onConflict: "platform_variant_id" },
  );

  if (error) {
    return { error: "Could not save these settings. Please try again." };
  }

  const result = await syncApprovalsForItem(contentItemId);

  revalidatePath("/dashboard/captions");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/production");
  revalidatePath("/dashboard/calendar");

  return {
    notice:
      result.invalidatedVariantIds.length > 0
        ? "Saved. The approval on this variant was withdrawn, because these settings change what would be published."
        : "Saved.",
  };
}
