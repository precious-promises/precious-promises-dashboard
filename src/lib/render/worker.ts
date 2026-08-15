import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditAsWorker } from "@/lib/audit/repository";
import type { ContentItem } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import type { ScriptRevision } from "@/lib/scripts/types";
import {
  generatedMediaExists,
  generatedObjectKey,
  recordGeneratedAsset,
  storeGeneratedMedia,
} from "./storage-bridge";
import { resolveRenderConfig } from "./server-config";
import { buildRenderProps } from "./build-props";
import type {
  ProductionAsset,
  VideoProject,
  VideoScene,
} from "@/lib/video/types";
import type { RenderJob } from "@/lib/video/render";
import { RENDER_COMPOSITION_ID } from "@/remotion/props";

/**
 * The render worker.
 *
 * Runs only in a background-capable server context — a Trigger.dev task or
 * an explicitly invoked orchestration — never inside an ordinary request.
 *
 * ## The honesty invariants
 *
 * - A job becomes `completed` **only after** the MP4 verifiably exists in the
 *   private bucket and its media_assets row is written. The database refuses
 *   `completed` without an output asset regardless of what this code does.
 * - The output key is deterministic and recorded on the row **at claim
 *   time** (`<owner>/rendered_video/render-<job>.mp4`), which is what makes
 *   crash reconciliation possible: a worker that died after writing the file
 *   is recovered from the found file, never re-rendered into a duplicate.
 * - A failure records a category and a reason. Only genuinely transient
 *   categories are worth retrying; a broken composition is not.
 */

export const RENDER_FAILURE_CATEGORIES = [
  "not_configured",
  "invalid_composition",
  "storage_error",
  "render_error",
  "worker_crashed",
  "transient",
] as const;
export type RenderFailureCategory = (typeof RENDER_FAILURE_CATEGORIES)[number];

/** Retry is only ever justified when repeating could genuinely differ. */
export const RETRYABLE_RENDER_FAILURES: readonly RenderFailureCategory[] = [
  "storage_error",
  "transient",
  "worker_crashed",
];

export function isRetryableRenderFailure(
  category: RenderFailureCategory,
): boolean {
  return RETRYABLE_RENDER_FAILURES.includes(category);
}

export interface RenderRunResult {
  jobId: string;
  outcome: "completed" | "failed" | "skipped";
  failureCategory: RenderFailureCategory | null;
  detail: string | null;
}

async function failJob(
  client: SupabaseClient,
  job: Pick<RenderJob, "id" | "owner_id">,
  category: RenderFailureCategory,
  reason: string,
): Promise<RenderRunResult> {
  await client
    .from("render_jobs")
    .update({
      status: "failed",
      failure_category: category,
      failure_reason: reason.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .in("status", ["queued", "rendering"]);

  await recordAuditAsWorker(
    client,
    job.owner_id,
    "render_failed",
    "render_job",
    job.id,
    { category },
  );

  return {
    jobId: job.id,
    outcome: "failed",
    failureCategory: category,
    detail: reason,
  };
}

interface LoadedComposition {
  project: VideoProject;
  scenes: VideoScene[];
  item: ContentItem | null;
  script: ScriptRevision | null;
  productionAssets: { slot: ProductionAsset; asset: MediaAsset | null }[];
  brandLine: string | null;
}

async function loadComposition(
  client: SupabaseClient,
  ownerId: string,
  projectId: string,
): Promise<LoadedComposition | null> {
  const { data: projectRow } = await client
    .from("video_projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!projectRow) {
    return null;
  }
  const project = projectRow as VideoProject;

  const [{ data: sceneRows }, { data: itemRow }, { data: slotRows }] =
    await Promise.all([
      client
        .from("video_scenes")
        .select("*")
        .eq("project_id", projectId)
        .eq("owner_id", ownerId)
        .order("scene_order", { ascending: true }),
      client
        .from("content_items")
        .select("*")
        .eq("id", project.content_item_id)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      client
        .from("production_assets")
        .select("*")
        .eq("project_id", projectId)
        .eq("owner_id", ownerId),
    ]);

  const item = (itemRow as ContentItem | null) ?? null;

  const { data: scriptRow } = await client
    .from("script_revisions")
    .select("*")
    .eq("content_item_id", project.content_item_id)
    .eq("owner_id", ownerId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const slots = (slotRows ?? []) as ProductionAsset[];
  const assetIds = slots.map((slot) => slot.media_asset_id);
  const sceneAssetIds = ((sceneRows ?? []) as VideoScene[])
    .map((scene) => scene.media_asset_id)
    .filter((id): id is string => id !== null);

  const allAssetIds = [...new Set([...assetIds, ...sceneAssetIds])];
  const { data: assetRows } = allAssetIds.length
    ? await client
        .from("media_assets")
        .select("*")
        .eq("owner_id", ownerId)
        .in("id", allAssetIds)
    : { data: [] };

  const assetById = new Map(
    ((assetRows ?? []) as MediaAsset[]).map((asset) => [asset.id, asset]),
  );

  const { data: settingsRow } = await client
    .from("app_settings")
    .select("brand_line")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const productionAssets = slots.map((slot) => ({
    slot,
    asset: assetById.get(slot.media_asset_id) ?? null,
  }));

  // Scene backgrounds resolve through the same map; buildRenderProps looks
  // them up by media_asset_id, so include them as pseudo-slots.
  for (const sceneAssetId of sceneAssetIds) {
    if (
      !productionAssets.some(
        (entry) => entry.slot.media_asset_id === sceneAssetId,
      )
    ) {
      const asset = assetById.get(sceneAssetId) ?? null;
      if (asset) {
        productionAssets.push({
          slot: {
            id: `scene-${sceneAssetId}`,
            owner_id: ownerId,
            project_id: projectId,
            media_asset_id: sceneAssetId,
            role: "background_video",
            starts_at_seconds: 0,
            notes: null,
            created_at: "",
            updated_at: "",
          } as ProductionAsset,
          asset,
        });
      }
    }
  }

  return {
    project,
    scenes: (sceneRows ?? []) as VideoScene[],
    item,
    script: (scriptRow as ScriptRevision | null) ?? null,
    productionAssets,
    brandLine:
      (settingsRow as { brand_line: string | null } | null)?.brand_line ?? null,
  };
}

/**
 * Complete a job from a file that already exists in storage.
 *
 * Shared by the normal path (which just stored it) and reconciliation
 * (which found it after a crash).
 */
async function completeFromStoredFile(
  client: SupabaseClient,
  job: Pick<RenderJob, "id" | "owner_id" | "project_id">,
  storagePath: string,
  sizeBytes: number,
  durationSeconds: number | null,
): Promise<RenderRunResult> {
  const assetId = await recordGeneratedAsset(client, {
    ownerId: job.owner_id,
    kind: "rendered_video",
    jobId: job.id,
    name: `Rendered video ${job.id.slice(0, 8)}`,
    stored: {
      path: storagePath,
      sizeBytes,
      contentType: "video/mp4",
    },
    mediaType: "video",
    durationSeconds,
  });

  if (assetId === null) {
    return failJob(
      client,
      job,
      "storage_error",
      "The rendered file exists but its media record could not be written.",
    );
  }

  await client
    .from("render_jobs")
    .update({
      status: "completed",
      output_media_asset_id: assetId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "rendering");

  await recordAuditAsWorker(
    client,
    job.owner_id,
    "render_completed",
    "render_job",
    job.id,
    { output_media_asset_id: assetId },
  );

  return {
    jobId: job.id,
    outcome: "completed",
    failureCategory: null,
    detail: null,
  };
}

/**
 * Run one queued render job to completion or honest failure.
 */
export async function runRenderJob(
  client: SupabaseClient,
  jobId: string,
): Promise<RenderRunResult> {
  const { config, problems } = resolveRenderConfig();

  const { data: jobRow } = await client
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!jobRow) {
    return {
      jobId,
      outcome: "skipped",
      failureCategory: null,
      detail: "No such render job.",
    };
  }
  const job = jobRow as RenderJob & { output_storage_path: string | null };

  if (job.status !== "queued") {
    return {
      jobId,
      outcome: "skipped",
      failureCategory: null,
      detail: `Job is ${job.status}, not queued.`,
    };
  }

  if (config === null) {
    return failJob(client, job, "not_configured", problems.join(" "));
  }

  // Claim: queued → rendering, with the deterministic output key recorded
  // before any work happens. The status guard makes the claim atomic.
  const outputPath = generatedObjectKey(
    job.owner_id,
    "rendered_video",
    `render-${job.id}`,
  );

  const { data: claimed } = await client
    .from("render_jobs")
    .update({
      status: "rendering",
      claimed_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      output_storage_path: outputPath,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id");

  if (!claimed || claimed.length === 0) {
    return {
      jobId,
      outcome: "skipped",
      failureCategory: null,
      detail: "Another worker claimed this job first.",
    };
  }

  await recordAuditAsWorker(
    client,
    job.owner_id,
    "render_started",
    "render_job",
    job.id,
    {},
  );

  const loaded = await loadComposition(client, job.owner_id, job.project_id);
  if (loaded === null) {
    return failJob(
      client,
      job,
      "invalid_composition",
      "The project this job references no longer exists.",
    );
  }

  const propsResult = await buildRenderProps(client, loaded);
  if (!propsResult.ok) {
    return failJob(client, job, propsResult.category, propsResult.reason);
  }

  let workDir: string | null = null;
  try {
    // Imported lazily: these packages carry headless-browser machinery that
    // must never be pulled into an ordinary request bundle.
    const { bundle } = await import("@remotion/bundler");
    const { renderMedia, selectComposition } =
      await import("@remotion/renderer");

    workDir = await mkdtemp(path.join(tmpdir(), "pp-render-"));
    const outputLocation = path.join(workDir, `${job.id}.mp4`);

    const serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
    });

    const composition = await selectComposition({
      serveUrl,
      id: RENDER_COMPOSITION_ID,
      inputProps: propsResult.props as unknown as Record<string, unknown>,
    });

    await renderMedia({
      codec: "h264",
      composition,
      serveUrl,
      outputLocation,
      inputProps: propsResult.props as unknown as Record<string, unknown>,
      chromiumOptions: { enableMultiProcessOnLinux: true },
    });

    const bytes = await readFile(outputLocation);

    const stored = await storeGeneratedMedia(client, {
      ownerId: job.owner_id,
      kind: "rendered_video",
      name: `render-${job.id}`,
      bytes: new Uint8Array(bytes),
      contentType: "video/mp4",
    });

    if (!stored.ok) {
      return failJob(
        client,
        job,
        "storage_error",
        `The rendered file could not be stored: ${stored.refusal}.`,
      );
    }

    const durationSeconds = Math.round(
      composition.durationInFrames / composition.fps,
    );

    return await completeFromStoredFile(
      client,
      job,
      stored.value.path,
      stored.value.sizeBytes,
      durationSeconds,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The render crashed.";
    return failJob(client, job, "render_error", message);
  } finally {
    if (workDir !== null) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Recover a job stuck in `rendering`.
 *
 * If the deterministic output exists in storage, the worker died after the
 * expensive part — complete the job from the found file rather than
 * rendering a duplicate. If it does not, the job is failed as
 * `worker_crashed`, which is retryable by an explicit new request.
 */
export async function reconcileRenderJob(
  client: SupabaseClient,
  jobId: string,
): Promise<RenderRunResult> {
  const { data: jobRow } = await client
    .from("render_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (!jobRow) {
    return {
      jobId,
      outcome: "skipped",
      failureCategory: null,
      detail: "No such render job.",
    };
  }

  const job = jobRow as RenderJob & { output_storage_path: string | null };

  if (job.status !== "rendering") {
    return {
      jobId,
      outcome: "skipped",
      failureCategory: null,
      detail: `Job is ${job.status}; only a job stuck in rendering can be reconciled.`,
    };
  }

  if (!job.output_storage_path) {
    return failJob(
      client,
      job,
      "worker_crashed",
      "The worker died before recording an output path. Nothing can be recovered; request the render again.",
    );
  }

  const found = await generatedMediaExists(
    client,
    job.owner_id,
    job.output_storage_path,
  );

  if (found.ok && found.value.exists && (found.value.sizeBytes ?? 0) > 0) {
    return completeFromStoredFile(
      client,
      job,
      job.output_storage_path,
      found.value.sizeBytes ?? 0,
      null,
    );
  }

  return failJob(
    client,
    job,
    "worker_crashed",
    "The worker died before the output file was written. The job can be requested again.",
  );
}

/** Process every queued job, oldest first. The dispatcher's loop. */
export async function processQueuedRenderJobs(
  client: SupabaseClient,
  limit = 3,
): Promise<RenderRunResult[]> {
  const { data } = await client
    .from("render_jobs")
    .select("id")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(limit);

  const results: RenderRunResult[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    results.push(await runRenderJob(client, row.id));
  }
  return results;
}
