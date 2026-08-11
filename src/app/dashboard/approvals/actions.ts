"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadReviewRow } from "@/lib/approvals/repository";
import { approvalBlockers, canTransitionReview } from "@/lib/approvals/rules";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { invalidationPause } from "@/lib/schedule/rules";
import type { ScheduledPost } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Approval decisions.
 *
 * **Approval publishes nothing.** It records that a human read this specific
 * wording and accepted it, together with a fingerprint of what they read.
 *
 * Every eligibility check runs here, on the server, against freshly loaded
 * records — the queue's opinion about whether something is approvable is never
 * taken as evidence. And every decision is per platform variant: approving the
 * YouTube wording touches exactly one row.
 */

const APPROVALS_PATH = "/dashboard/approvals";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }
  return { supabase, user };
}

function backTo(variantId: string, notice: string): never {
  revalidatePath(APPROVALS_PATH);
  revalidatePath("/dashboard/production");
  redirect(`${APPROVALS_PATH}?variant=${variantId}&notice=${notice}`);
}

/** Move a draft into the queue. */
export async function submitForReview(formData: FormData): Promise<void> {
  const variantId = formData.get("variant_id");
  if (typeof variantId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();
  const row = await loadReviewRow(variantId);

  if (!row) {
    redirect(APPROVALS_PATH);
  }

  if (!canTransitionReview(row.variant.review_state, "ready_for_review")) {
    backTo(variantId, "transition-refused");
  }

  await supabase
    .from("platform_variants")
    .update({
      review_state: "ready_for_review",
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })
    .eq("id", variantId)
    .eq("owner_id", user.id);

  await recordAudit(
    "variant_submitted_for_review",
    "platform_variant",
    variantId,
    { platform: row.variant.platform },
  );

  backTo(variantId, "submitted");
}

/**
 * Approve one platform variant.
 *
 * The fingerprint stored is the one computed from records **in this request**,
 * not one supplied by the page. A hash accepted from a form would let a caller
 * assert that stale content had been reviewed.
 */
export async function approveVariant(formData: FormData): Promise<void> {
  const variantId = formData.get("variant_id");
  if (typeof variantId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();
  const row = await loadReviewRow(variantId);

  if (!row) {
    redirect(APPROVALS_PATH);
  }

  // Re-checked here rather than trusted from the rendered page: the content
  // may have changed between the queue rendering and this click.
  const blockers = approvalBlockers({
    variant: row.variant,
    item: row.item,
    hasVideo: row.hasVideo,
    mediaCount: row.mediaCount,
    platformProblems: row.platformProblems,
  });

  if (blockers.length > 0) {
    backTo(variantId, "blocked");
  }

  const { error } = await supabase
    .from("platform_variants")
    .update({
      review_state: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      approval_hash: row.currentFingerprint,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })
    .eq("id", variantId)
    .eq("owner_id", user.id);

  if (error) {
    backTo(variantId, "approve-failed");
  }

  await recordAudit("variant_approved", "platform_variant", variantId, {
    platform: row.variant.platform,
    variant_type: row.variant.variant_type,
    content_item_id: row.item.id,
  });

  backTo(variantId, "approved");
}

/** Reject a variant. A reason is required — the database insists too. */
export async function rejectVariant(formData: FormData): Promise<void> {
  const variantId = formData.get("variant_id");
  const reason = formData.get("reason");

  if (typeof variantId !== "string") {
    return;
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    backTo(variantId, "reason-required");
  }

  const { supabase, user } = await requireUser();
  const row = await loadReviewRow(variantId);

  if (!row) {
    redirect(APPROVALS_PATH);
  }

  if (!canTransitionReview(row.variant.review_state, "rejected")) {
    backTo(variantId, "transition-refused");
  }

  await supabase
    .from("platform_variants")
    .update({
      review_state: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by: user.id,
      rejection_reason: reason.trim().slice(0, 2000),
      approved_at: null,
      approved_by: null,
      approval_hash: null,
    })
    .eq("id", variantId)
    .eq("owner_id", user.id);

  await recordAudit("variant_rejected", "platform_variant", variantId, {
    platform: row.variant.platform,
    reason: reason.trim(),
  });

  await pauseSchedulesFor(variantId, "The variant was rejected.");

  backTo(variantId, "rejected");
}

/**
 * Return a variant to draft.
 *
 * Clears approval metadata, because an approval that survived a return to
 * draft would be an approval of something nobody is claiming is finished.
 */
export async function returnToDraft(formData: FormData): Promise<void> {
  const variantId = formData.get("variant_id");
  if (typeof variantId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();
  const row = await loadReviewRow(variantId);

  if (!row) {
    redirect(APPROVALS_PATH);
  }

  if (!canTransitionReview(row.variant.review_state, "draft")) {
    backTo(variantId, "transition-refused");
  }

  await supabase
    .from("platform_variants")
    .update({
      review_state: "draft",
      approved_at: null,
      approved_by: null,
      approval_hash: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })
    .eq("id", variantId)
    .eq("owner_id", user.id);

  await recordAudit(
    "variant_returned_to_draft",
    "platform_variant",
    variantId,
    { platform: row.variant.platform },
  );

  await pauseSchedulesFor(variantId, "The variant was returned to draft.");

  backTo(variantId, "returned");
}

/**
 * Pause anything scheduled on an approval that has just gone away.
 *
 * Paused rather than cancelled: the time the owner chose is still the time
 * they want, and cancelling would throw the slot away on their behalf.
 */
async function pauseSchedulesFor(
  variantId: string,
  reason: string,
): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("scheduled_posts")
    .select("*")
    .eq("owner_id", user.id)
    .eq("platform_variant_id", variantId)
    .eq("status", "scheduled");

  for (const post of (data ?? []) as ScheduledPost[]) {
    const { error } = await supabase
      .from("scheduled_posts")
      .update(invalidationPause(reason, new Date()))
      .eq("id", post.id)
      .eq("owner_id", user.id);

    if (!error) {
      await recordAudit("schedule_paused", "scheduled_post", post.id, {
        reason,
        scheduled_for: post.scheduled_for,
      });
    }
  }

  revalidatePath("/dashboard/calendar");
}
