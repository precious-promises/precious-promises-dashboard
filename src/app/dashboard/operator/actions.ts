"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";
import { runOperatorForOwner } from "@/lib/automation/operator";

const OPERATOR_PATH = "/dashboard/operator";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(LOGIN_PATH);
  return { supabase, user };
}

export async function saveOperatorPreferences(
  formData: FormData,
): Promise<void> {
  const { supabase, user } = await requireUser();

  const automation_enabled = formData.get("automation_enabled") === "on";
  const automation_create_working_drafts =
    formData.get("automation_create_working_drafts") === "on";
  const automation_prepare_video_drafts =
    formData.get("automation_prepare_video_drafts") === "on";
  const automation_submit_for_review =
    formData.get("automation_submit_for_review") === "on";

  const { error } = await supabase.from("app_settings").upsert(
    {
      owner_id: user.id,
      automation_enabled,
      automation_create_working_drafts,
      automation_prepare_video_drafts,
      automation_submit_for_review,
    },
    { onConflict: "owner_id" },
  );

  revalidatePath(OPERATOR_PATH);
  revalidatePath("/dashboard/settings");
  redirect(
    `${OPERATOR_PATH}?notice=${error ? "settings-failed" : "settings-saved"}`,
  );
}

export async function runOperatorNow(): Promise<void> {
  const { user } = await requireUser();
  const { client } = createWorkerClient();

  if (client === null) {
    redirect(`${OPERATOR_PATH}?notice=worker-not-configured`);
  }

  const result = await runOperatorForOwner(client, user.id);

  revalidatePath(OPERATOR_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/production");
  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/captions");
  revalidatePath("/dashboard/approvals");

  if (result.status === "disabled") {
    redirect(`${OPERATOR_PATH}?notice=disabled`);
  }
  if (result.status === "failed") {
    redirect(`${OPERATOR_PATH}?notice=run-failed`);
  }

  redirect(`${OPERATOR_PATH}?notice=run-completed`);
}
