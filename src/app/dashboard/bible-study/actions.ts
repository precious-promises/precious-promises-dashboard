"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  generateBibleStudy,
} from "@/lib/bible-study/repository";
import {
  bibleStudyRequestSchema,
  type BibleStudyReviewState,
} from "@/lib/bible-study/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";

export interface BibleStudyActionState {
  error?: string;
  notice?: string;
  revisionId?: string;
}

async function owner() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_PATH);
  return { supabase, user };
}

export async function createBibleStudy(
  _previous: BibleStudyActionState,
  formData: FormData,
): Promise<BibleStudyActionState> {
  const parsed = bibleStudyRequestSchema.safeParse({
    provider: formData.get("provider"),
    topicOrPassage: formData.get("topic_or_passage"),
    translation: formData.get("translation"),
    depth: formData.get("depth"),
    audience: formData.get("audience"),
    emphasis: formData.get("emphasis") ?? "",
  });
  if (!parsed.success) {
    return { error: "Check the provider, passage/topic, translation, depth and audience." };
  }

  const { user } = await owner();
  const { client } = createWorkerClient();
  if (!client) {
    return {
      error:
        "The trusted worker credential is not configured, so a generated study cannot be saved with trustworthy provenance.",
    };
  }

  const forceRegenerate = formData.get("force_regenerate") === "true";
  const result = await generateBibleStudy(client, user.id, parsed.data, {
    forceRegenerate,
  });
  if (!result.ok) return { error: result.detail };

  revalidatePath("/dashboard/bible-study");
  return {
    notice: result.reused
      ? "An exact saved result already exists, so no API tokens were spent. Reopened the saved study."
      : "Bible Study generated and saved. Scripture verification and your approval are still required.",
    revisionId: result.revision.id,
  };
}

async function updateRevisionDecision(
  revisionId: string,
  update: Record<string, unknown>,
  expectedStates?: BibleStudyReviewState[],
): Promise<boolean> {
  const { user } = await owner();
  const { client } = createWorkerClient();
  if (!client) return false;

  let query = client
    .from("bible_study_revisions")
    .update(update)
    .eq("id", revisionId)
    .eq("owner_id", user.id);

  if (expectedStates?.length) query = query.in("review_state", expectedStates);
  const { data } = await query.select("id");
  return (data ?? []).length > 0;
}

export async function markBibleStudyScriptureVerified(formData: FormData) {
  const revisionId = formData.get("revision_id");
  if (typeof revisionId !== "string" || !revisionId) return;

  const { user } = await owner();
  const changed = await updateRevisionDecision(revisionId, {
    scripture_verification_status: "manually_verified",
    scripture_verified_at: new Date().toISOString(),
    scripture_verified_by: user.id,
    review_state: "ready_for_review",
  });
  if (changed) revalidatePath("/dashboard/bible-study");
}

export async function approveBibleStudy(formData: FormData) {
  const revisionId = formData.get("revision_id");
  if (typeof revisionId !== "string" || !revisionId) return;

  const { user } = await owner();
  const { client } = createWorkerClient();
  if (!client) return;

  const { data: revision } = await client
    .from("bible_study_revisions")
    .select("id, scripture_verification_status, review_state")
    .eq("id", revisionId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (
    !revision ||
    revision.scripture_verification_status !== "manually_verified" ||
    !["draft", "ready_for_review"].includes(revision.review_state)
  ) {
    return;
  }

  await client
    .from("bible_study_revisions")
    .update({
      review_state: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      rejection_reason: null,
    })
    .eq("id", revisionId)
    .eq("owner_id", user.id)
    .eq("scripture_verification_status", "manually_verified");

  revalidatePath("/dashboard/bible-study");
}

export async function rejectBibleStudy(formData: FormData) {
  const revisionId = formData.get("revision_id");
  if (typeof revisionId !== "string" || !revisionId) return;
  const reason = formData.get("reason");
  const changed = await updateRevisionDecision(
    revisionId,
    {
      review_state: "rejected",
      rejection_reason:
        typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 2000)
          : "Rejected by owner.",
      approved_at: null,
      approved_by: null,
    },
    ["draft", "ready_for_review"],
  );
  if (changed) revalidatePath("/dashboard/bible-study");
}
