"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncApprovalsForItem } from "@/lib/approvals/invalidate";
import { parseVariantForm, variantValuesFrom } from "@/lib/variants/schema";
import type { VariantFieldErrors } from "@/lib/variants/schema";
import { canMarkReadyForReview } from "@/lib/variants/types";
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
