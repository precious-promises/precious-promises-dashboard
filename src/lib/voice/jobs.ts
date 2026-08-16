import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditAsWorker } from "@/lib/audit/repository";
import type { ScriptRevision } from "@/lib/scripts/types";
import { SPOKEN_SECTIONS } from "@/lib/scripts/types";
import {
  recordGeneratedAsset,
  storeGeneratedMedia,
} from "@/lib/storage/generated";

import { NARRATION_SECTION_SEPARATOR } from "./config";
import {
  generateSpeech,
  isRetryableVoiceFailure,
  VOICE_FAILURE_MESSAGES,
  type VoiceFailureCategory,
} from "./provider";

/**
 * Voice generation lifecycle.
 *
 * Every generation is a `voice_jobs` row, written by trusted server code as
 * the generation actually happens — the browser can watch, never write. The
 * audio becomes a private generated asset attached to the video project's
 * voiceover slot; nothing here plays, publishes or approves anything.
 */

export interface VoiceJobRow {
  id: string;
  owner_id: string;
  video_project_id: string | null;
  script_revision_id: string | null;
  content_item_id: string | null;
  voice_id: string;
  model_id: string;
  character_count: number;
  status: "queued" | "generating" | "completed" | "failed" | "cancelled";
  failure_category: string | null;
  failure_detail: string | null;
  output_media_asset_id: string | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/** What narration reads: the spoken sections of a revision, in order. */
export function narrationTextFrom(script: ScriptRevision): string {
  return SPOKEN_SECTIONS.map((section) => script[section])
    .filter(
      (text): text is string => typeof text === "string" && text.trim() !== "",
    )
    .map((text) => text.trim())
    .join(NARRATION_SECTION_SEPARATOR);
}

export interface VoiceRunResult {
  ok: boolean;
  jobId: string | null;
  category: VoiceFailureCategory | null;
  detail: string | null;
  retryable: boolean;
  outputMediaAssetId: string | null;
}

/**
 * Generate narration for a script revision and attach it to a project.
 *
 * The full lifecycle in one orchestration: create the job row, call the
 * provider, store the audio privately, record the asset, complete the job.
 * A failure at any step is written to the job with its category — never
 * converted into a fake success — and the last good voiceover asset is left
 * exactly where it was.
 */
export async function runVoiceGeneration(
  client: SupabaseClient,
  input: {
    ownerId: string;
    videoProjectId: string | null;
    contentItemId: string | null;
    script: ScriptRevision;
    voiceId: string;
    modelId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<VoiceRunResult> {
  const text = narrationTextFrom(input.script);

  const { data: jobRow } = await client
    .from("voice_jobs")
    .insert({
      owner_id: input.ownerId,
      video_project_id: input.videoProjectId,
      script_revision_id: input.script.id,
      content_item_id: input.contentItemId,
      voice_id: input.voiceId,
      model_id: input.modelId,
      character_count: text.length,
      status: "generating",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (!jobRow) {
    return {
      ok: false,
      jobId: null,
      category: "unknown",
      detail: "The voice job could not be recorded.",
      retryable: false,
      outputMediaAssetId: null,
    };
  }
  const jobId = (jobRow as { id: string }).id;

  await recordAuditAsWorker(
    client,
    input.ownerId,
    "voice_generation_requested",
    "voice_job",
    jobId,
    { model: input.modelId, characters: text.length },
  );

  const fail = async (
    category: VoiceFailureCategory,
  ): Promise<VoiceRunResult> => {
    const detail = VOICE_FAILURE_MESSAGES[category];
    await client
      .from("voice_jobs")
      .update({
        status: "failed",
        failure_category: category,
        failure_detail: detail,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await recordAuditAsWorker(
      client,
      input.ownerId,
      "voice_generation_failed",
      "voice_job",
      jobId,
      { category },
    );

    return {
      ok: false,
      jobId,
      category,
      detail,
      retryable: isRetryableVoiceFailure(category),
      outputMediaAssetId: null,
    };
  };

  const speech = await generateSpeech(
    { text, voiceId: input.voiceId, modelId: input.modelId },
    fetchImpl,
  );

  if (!speech.ok) {
    return fail(speech.category);
  }

  const stored = await storeGeneratedMedia(client, {
    ownerId: input.ownerId,
    kind: "voiceover",
    name: `voiceover-${jobId}`,
    bytes: speech.audio,
    contentType: speech.contentType,
  });

  if (!stored.ok) {
    return fail("unknown");
  }

  const assetId = await recordGeneratedAsset(client, {
    ownerId: input.ownerId,
    kind: "voiceover",
    jobId,
    name: `Voiceover ${jobId.slice(0, 8)}`,
    stored: stored.value,
    mediaType: "audio",
  });

  if (assetId === null) {
    return fail("unknown");
  }

  await client
    .from("voice_jobs")
    .update({
      status: "completed",
      output_media_asset_id: assetId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  await recordAuditAsWorker(
    client,
    input.ownerId,
    "voice_generation_completed",
    "voice_job",
    jobId,
    { output_media_asset_id: assetId },
  );

  // Attach to the project's voiceover slot when a project was named. The
  // slot update goes through the same worker write the rest of this
  // lifecycle used; the previous voiceover asset row is left in the library.
  if (input.videoProjectId !== null) {
    await client.from("production_assets").upsert(
      {
        owner_id: input.ownerId,
        project_id: input.videoProjectId,
        media_asset_id: assetId,
        role: "voiceover",
        starts_at_seconds: 0,
      },
      { onConflict: "project_id,role" },
    );
  }

  return {
    ok: true,
    jobId,
    category: null,
    detail: null,
    retryable: false,
    outputMediaAssetId: assetId,
  };
}
