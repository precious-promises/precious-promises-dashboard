"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  canTransitionProduction,
  PRODUCTION_JOB_STATUSES,
  type ProductionJob,
  type ProductionJobStatus,
} from "@/lib/production/pipeline";
import type { ScriptRevision } from "@/lib/scripts/types";
import { effectiveSettings, loadAppSettings } from "@/lib/settings/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";
import { DEFAULT_VOICE_MODEL } from "@/lib/voice/config";
import { runVoiceGeneration } from "@/lib/voice/jobs";

/**
 * Production pipeline actions.
 *
 * Every step is explicit and owner-triggered. The voice step runs the same
 * voice orchestration the studio uses; the render step points at the same
 * render request path. Failure at a step marks the job failed and blocks
 * later steps; nothing here can approach approval, scheduling or publishing.
 */

const PRODUCTION_PATH = "/dashboard/production";

export interface PipelineActionState {
  error?: string;
  notice?: string;
}

function isProductionStatus(value: unknown): value is ProductionJobStatus {
  return (
    typeof value === "string" &&
    (PRODUCTION_JOB_STATUSES as readonly string[]).includes(value)
  );
}

export async function createProductionJob(
  _previous: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const contentItemId = formData.get("content_item_id");
  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
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

  // The item's video project, when one exists, is linked from the start so
  // the voice and render steps know where to put their artefacts.
  const { data: project } = await supabase
    .from("video_projects")
    .select("id")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", user.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("production_jobs")
    .insert({
      owner_id: user.id,
      content_item_id: contentItemId,
      video_project_id: (project as { id: string } | null)?.id ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "The production job could not be created." };
  }

  await recordAudit(
    "production_job_created",
    "production_job",
    (data as { id: string }).id,
    {},
  );

  revalidatePath(PRODUCTION_PATH);
  return {
    notice:
      "Production job created. Each step is yours to trigger; the pipeline ends at ready for review.",
  };
}

async function ownedJob(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data } = await supabase
    .from("production_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return { supabase, user, job: (data as ProductionJob | null) ?? null };
}

/**
 * Advance a job one explicit step.
 *
 * The voice step genuinely generates (and fails the job honestly when it
 * cannot); the other steps record progress and link the artefacts the owner
 * produced through the studios. No step is automatic.
 */
export async function advanceProductionJob(
  _previous: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const jobId = formData.get("production_job_id");
  const target = formData.get("target_status");

  if (typeof jobId !== "string" || jobId === "") {
    return { error: "That production job could not be found." };
  }
  if (!isProductionStatus(target)) {
    return { error: "That step could not be recognised." };
  }

  const { supabase, user, job } = await ownedJob(jobId);
  if (job === null) {
    return { error: "That production job could not be found." };
  }

  if (!canTransitionProduction(job.status, target)) {
    return {
      error: `A job that is ${job.status.replace(/_/g, " ")} cannot move to ${target.replace(/_/g, " ")}. Steps only move forward.`,
    };
  }

  // --- The voice step does real work. -------------------------------------
  if (target === "generating_voice") {
    const { client } = createWorkerClient();
    if (client === null) {
      return { error: "No trusted worker credential is configured." };
    }

    const { data: scriptRow } = await supabase
      .from("script_revisions")
      .select("*")
      .eq("content_item_id", job.content_item_id)
      .eq("owner_id", user.id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const script = (scriptRow as ScriptRevision | null) ?? null;
    if (script === null) {
      return {
        error:
          "There is no script to narrate. Write or accept one in the Script Studio first.",
      };
    }

    const settings = effectiveSettings(await loadAppSettings());
    if (!settings.elevenlabs_voice_id) {
      return {
        error: "No voice is configured. Choose one in Settings first.",
      };
    }

    // Mark the step before the work, so a crash leaves an honest state.
    await supabase
      .from("production_jobs")
      .update({ status: "generating_voice" })
      .eq("id", jobId)
      .eq("owner_id", user.id);

    const result = await runVoiceGeneration(client, {
      ownerId: user.id,
      videoProjectId: job.video_project_id,
      contentItemId: job.content_item_id,
      script,
      voiceId: settings.elevenlabs_voice_id,
      modelId: settings.elevenlabs_model_id ?? DEFAULT_VOICE_MODEL,
    });

    if (!result.ok) {
      await supabase
        .from("production_jobs")
        .update({
          status: "failed",
          failure_category: result.category ?? "unknown",
          failure_detail: result.detail,
          voice_job_id: result.jobId,
        })
        .eq("id", jobId)
        .eq("owner_id", user.id);

      await recordAudit("production_job_failed", "production_job", jobId, {
        step: "generating_voice",
        category: result.category ?? "unknown",
      });

      return {
        error: `Narration failed: ${result.detail ?? "unknown reason"}. The job is marked failed; later steps stay blocked.`,
      };
    }

    await supabase
      .from("production_jobs")
      .update({ status: "generating_voice", voice_job_id: result.jobId })
      .eq("id", jobId)
      .eq("owner_id", user.id);

    await recordAudit("production_job_advanced", "production_job", jobId, {
      to: "generating_voice",
    });

    revalidatePath(PRODUCTION_PATH);
    return {
      notice:
        "Narration generated and attached to the project's voiceover slot. Advance to the next step when ready.",
    };
  }

  // --- Recording steps: link artefacts, move the marker. ------------------
  const update: Record<string, unknown> = { status: target };

  if (target === "ready_for_review") {
    update.completed_at = new Date().toISOString();

    // If a render step ran, its job must genuinely be completed — a pipeline
    // claiming review-readiness over a failed render would be a fake.
    if (job.render_job_id !== null) {
      const { data: renderRow } = await supabase
        .from("render_jobs")
        .select("status")
        .eq("id", job.render_job_id)
        .eq("owner_id", user.id)
        .maybeSingle();

      const renderStatus = (renderRow as { status: string } | null)?.status;
      if (renderStatus !== "completed") {
        return {
          error: `The linked render is ${renderStatus ?? "missing"}, not completed. A job is only ready for review when its artefacts genuinely exist.`,
        };
      }
    }
  }

  if (target === "rendering") {
    const renderJobId = formData.get("render_job_id");
    if (typeof renderJobId === "string" && renderJobId !== "") {
      const { data: owned } = await supabase
        .from("render_jobs")
        .select("id")
        .eq("id", renderJobId)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!owned) {
        return { error: "That render job could not be found." };
      }
      update.render_job_id = renderJobId;
    }
  }

  if (target === "generating_text") {
    const generationId = formData.get("ai_generation_id");
    if (typeof generationId === "string" && generationId !== "") {
      update.ai_generation_id = generationId;
    }
  }

  const { error } = await supabase
    .from("production_jobs")
    .update(update)
    .eq("id", jobId)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "The step could not be recorded." };
  }

  await recordAudit("production_job_advanced", "production_job", jobId, {
    to: target,
  });

  revalidatePath(PRODUCTION_PATH);
  return {
    notice:
      target === "ready_for_review"
        ? "Ready for review. From here the existing human path takes over: review, approval, scheduling."
        : "Step recorded.",
  };
}

export async function cancelProductionJob(
  _previous: PipelineActionState,
  formData: FormData,
): Promise<PipelineActionState> {
  const jobId = formData.get("production_job_id");
  if (typeof jobId !== "string" || jobId === "") {
    return { error: "That production job could not be found." };
  }

  const { supabase, user, job } = await ownedJob(jobId);
  if (job === null) {
    return { error: "That production job could not be found." };
  }

  if (!canTransitionProduction(job.status, "cancelled")) {
    return { error: "This job is already finished and cannot be cancelled." };
  }

  const { error } = await supabase
    .from("production_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "The job could not be cancelled." };
  }

  await recordAudit("production_job_cancelled", "production_job", jobId, {});

  revalidatePath(PRODUCTION_PATH);
  return {
    notice:
      "Cancelled. Future steps stop; everything already created and every audit entry is kept.",
  };
}
