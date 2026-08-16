"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncApprovalsForItem } from "@/lib/approvals/invalidate";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getRenderProvider, requestRender } from "@/lib/video/render";
import {
  processQueuedRenderJobs,
  reconcileRenderJob,
} from "@/lib/render/worker";
import { createWorkerClient } from "@/lib/supabase/worker";
// Registers the Remotion provider into the render registry. Server-only.
import "@/lib/render/register";
import {
  clampDuration,
  nextSceneOrder,
  normaliseOrder,
  splitDurations,
  totalDuration,
} from "@/lib/video/scenes";
import {
  parseProductionAssetForm,
  parseProjectForm,
  parseSceneForm,
  productionAssetValuesFrom,
  projectValuesFrom,
  sceneValuesFrom,
  type ProjectFieldErrors,
  type SceneFieldErrors,
} from "@/lib/video/schema";
import { sceneTextSourceFor, type VideoScene } from "@/lib/video/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Video studio write paths.
 *
 * **Nothing here renders or publishes.** The render action asks the configured
 * provider; there is none, so it records a failed render job and says so. It
 * never writes a `completed` job — the database will not accept one without an
 * output file.
 *
 * `owner_id` is read from the session in every action. It is absent from every
 * schema, so a value smuggled through a form is discarded before the insert.
 */

const VIDEO_PATH = "/dashboard/video";

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

/** The caller's project, or `null` if it is not theirs. */
async function ownedProject(projectId: string) {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("video_projects")
    .select("id, current_revision, content_item_id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return { supabase, user, project: data ?? null };
}

/**
 * Recompute what the project stores about its scenes.
 *
 * The duration estimate is derived, never typed in, so it cannot disagree with
 * the timeline. The revision increments on every structural change, which is
 * what lets a render job record the composition it was actually asked for.
 */
async function refreshProjectDerived(projectId: string): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data: scenes } = await supabase
    .from("video_scenes")
    .select("duration_seconds")
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  const { data: project } = await supabase
    .from("video_projects")
    .select("current_revision")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!project) {
    return;
  }

  await supabase
    .from("video_projects")
    .update({
      duration_estimate_seconds: totalDuration(
        (scenes ?? []) as Pick<VideoScene, "duration_seconds">[],
      ),
      current_revision: (project.current_revision as number) + 1,
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  // The video and its revision are part of every variant's approval
  // fingerprint for this item — a recut composition is different content, even
  // when the caption is identical. Withdraw any approval it invalidated.
  const { data: owning } = await supabase
    .from("video_projects")
    .select("content_item_id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owning) {
    await syncApprovalsForItem(owning.content_item_id as string);
  }
}

function editorPath(projectId: string, sceneId?: string | null): string {
  return sceneId
    ? `${VIDEO_PATH}/${projectId}?scene=${sceneId}`
    : `${VIDEO_PATH}/${projectId}`;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectActionState {
  error?: string;
  fieldErrors?: ProjectFieldErrors;
}

export async function createVideoProject(
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const parsed = parseProjectForm(projectValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors as ProjectFieldErrors };
  }

  const { supabase, user } = await requireUser();

  // The project is built from a content item, so the item must be the
  // caller's. RLS enforces this too; checking here turns a database error into
  // a sentence the owner can act on.
  const { data: item } = await supabase
    .from("content_items")
    .select("id")
    .eq("id", parsed.data.content_item_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!item) {
    return { error: "That content item could not be found." };
  }

  const { data, error } = await supabase
    .from("video_projects")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not create this project. Please try again." };
  }

  revalidatePath(VIDEO_PATH);
  redirect(editorPath(data.id as string));
}

export async function updateVideoProject(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  if (typeof projectId !== "string" || projectId === "") {
    return;
  }

  const parsed = parseProjectForm(projectValuesFrom(formData));
  if (!parsed.success) {
    redirect(`${editorPath(projectId)}?notice=project-invalid`);
  }

  const { supabase, user } = await requireUser();

  await supabase
    .from("video_projects")
    .update({
      name: parsed.data.name,
      aspect_ratio: parsed.data.aspect_ratio,
      status: parsed.data.status,
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  revalidatePath(VIDEO_PATH);
  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=project-saved`);
}

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

export interface SceneActionState {
  error?: string;
  fieldErrors?: SceneFieldErrors;
}

/** Append a scene of the requested type with sensible defaults. */
export async function addScene(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const sceneType = formData.get("scene_type");
  if (typeof projectId !== "string" || typeof sceneType !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const parsed = parseSceneForm({
    scene_type: sceneType,
    // A Scripture scene is forced onto the referenced source; everything else
    // starts as text written in the scene.
    text_source: sceneType === "scripture" ? "content_scripture" : "custom",
    duration_seconds: 5,
  });

  if (!parsed.success) {
    redirect(`${editorPath(projectId)}?notice=scene-invalid`);
  }

  const { data: existing } = await supabase
    .from("video_scenes")
    .select("scene_order")
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  const { data: created } = await supabase
    .from("video_scenes")
    .insert({
      ...parsed.data,
      project_id: projectId,
      owner_id: user.id,
      scene_order: nextSceneOrder(
        (existing ?? []) as Pick<VideoScene, "scene_order">[],
      ),
    })
    .select("id")
    .single();

  await refreshProjectDerived(projectId);
  revalidatePath(editorPath(projectId));
  redirect(editorPath(projectId, (created?.id as string | undefined) ?? null));
}

export async function updateScene(
  _previous: SceneActionState,
  formData: FormData,
): Promise<SceneActionState> {
  const projectId = formData.get("project_id");
  const sceneId = formData.get("scene_id");
  if (typeof projectId !== "string" || typeof sceneId !== "string") {
    return { error: "That scene could not be found." };
  }

  const values = sceneValuesFrom(formData) as Record<string, unknown>;

  // Force the text source that the scene type allows before validating, so a
  // tampered form field cannot ask a prayer to render the verse.
  const requestedType = values.scene_type;
  if (typeof requestedType === "string") {
    values.text_source = sceneTextSourceFor(
      requestedType as VideoScene["scene_type"],
      (values.text_source ?? "custom") as VideoScene["text_source"],
    );
  }
  if (values.text_source !== "custom") {
    values.text_content = undefined;
  }

  const parsed = parseSceneForm(values);
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors as SceneFieldErrors };
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    return { error: "That project could not be found." };
  }

  const { error } = await supabase
    .from("video_scenes")
    .update({
      ...parsed.data,
      duration_seconds: clampDuration(parsed.data.duration_seconds),
      media_asset_id: parsed.data.media_asset_id ?? null,
      text_content: parsed.data.text_content ?? null,
    })
    .eq("id", sceneId)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "Could not save this scene. Please try again." };
  }

  await refreshProjectDerived(projectId);
  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId, sceneId)}&notice=scene-saved`);
}

export async function deleteScene(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const sceneId = formData.get("scene_id");
  if (typeof projectId !== "string" || typeof sceneId !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  await supabase
    .from("video_scenes")
    .delete()
    .eq("id", sceneId)
    .eq("owner_id", user.id);

  await renumber(projectId);
  await refreshProjectDerived(projectId);
  revalidatePath(editorPath(projectId));
  redirect(editorPath(projectId));
}

/**
 * Rewrite `scene_order` as 1..n.
 *
 * Done in two passes through a temporary offset, because `scene_order` is
 * unique per project: writing the new numbers directly would collide with the
 * rows that still hold them.
 */
async function renumber(projectId: string): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("video_scenes")
    .select("id, scene_order, duration_seconds")
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  const ordered = normaliseOrder(
    (data ?? []) as Pick<
      VideoScene,
      "id" | "scene_order" | "duration_seconds"
    >[],
  );

  const offset = ordered.length + 1000;
  for (const [index, scene] of ordered.entries()) {
    await supabase
      .from("video_scenes")
      .update({ scene_order: offset + index })
      .eq("id", scene.id)
      .eq("owner_id", user.id);
  }
  for (const scene of ordered) {
    await supabase
      .from("video_scenes")
      .update({ scene_order: scene.scene_order })
      .eq("id", scene.id)
      .eq("owner_id", user.id);
  }
}

export async function moveScene(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const sceneId = formData.get("scene_id");
  const direction = formData.get("direction");

  if (
    typeof projectId !== "string" ||
    typeof sceneId !== "string" ||
    (direction !== "up" && direction !== "down")
  ) {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const { data } = await supabase
    .from("video_scenes")
    .select("id, scene_order, duration_seconds")
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  const current = normaliseOrder(
    (data ?? []) as Pick<
      VideoScene,
      "id" | "scene_order" | "duration_seconds"
    >[],
  );
  const index = current.findIndex((scene) => scene.id === sceneId);
  const target = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || target < 0 || target >= current.length) {
    redirect(editorPath(projectId, sceneId));
  }

  const a = current[index]!;
  const b = current[target]!;

  // Park one row outside the range first: (project_id, scene_order) is unique,
  // so a straight swap would violate it mid-way.
  const parked = current.length + 1000;
  await supabase
    .from("video_scenes")
    .update({ scene_order: parked })
    .eq("id", a.id)
    .eq("owner_id", user.id);
  await supabase
    .from("video_scenes")
    .update({ scene_order: a.scene_order })
    .eq("id", b.id)
    .eq("owner_id", user.id);
  await supabase
    .from("video_scenes")
    .update({ scene_order: b.scene_order })
    .eq("id", a.id)
    .eq("owner_id", user.id);

  await refreshProjectDerived(projectId);
  revalidatePath(editorPath(projectId));
  redirect(editorPath(projectId, sceneId));
}

/**
 * Split a scene into two of half the length.
 *
 * This splits the *scene* — how long a layer is on screen — not a media file.
 * Nothing here cuts video: the studio references assets whose bytes live
 * elsewhere, and no transcoding exists.
 */
export async function splitScene(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const sceneId = formData.get("scene_id");
  if (typeof projectId !== "string" || typeof sceneId !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const { data: scene } = await supabase
    .from("video_scenes")
    .select("*")
    .eq("id", sceneId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!scene) {
    redirect(editorPath(projectId));
  }

  const source = scene as VideoScene;
  const halves = splitDurations(source.duration_seconds);
  if (halves === null) {
    redirect(`${editorPath(projectId, sceneId)}&notice=scene-too-short`);
  }

  const [first, second] = halves;

  await supabase
    .from("video_scenes")
    .update({ duration_seconds: first })
    .eq("id", sceneId)
    .eq("owner_id", user.id);

  const { data: existing } = await supabase
    .from("video_scenes")
    .select("scene_order")
    .eq("project_id", projectId)
    .eq("owner_id", user.id);

  await supabase.from("video_scenes").insert({
    project_id: projectId,
    owner_id: user.id,
    scene_order: nextSceneOrder(
      (existing ?? []) as Pick<VideoScene, "scene_order">[],
    ),
    scene_type: source.scene_type,
    text_source: source.text_source,
    text_content: source.text_content,
    media_asset_id: source.media_asset_id,
    duration_seconds: second,
    transition: source.transition,
    text_position: source.text_position,
    text_align: source.text_align,
    text_animation: source.text_animation,
  });

  // The copy lands at the end; put it back beside its original.
  await reorderAfter(projectId, sceneId);
  await refreshProjectDerived(projectId);
  revalidatePath(editorPath(projectId));
  redirect(editorPath(projectId, sceneId));
}

/** Move the newest scene to sit directly after `afterSceneId`. */
async function reorderAfter(
  projectId: string,
  afterSceneId: string,
): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("video_scenes")
    .select("id, scene_order, duration_seconds, created_at")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("scene_order", { ascending: true });

  const scenes = (data ?? []) as (Pick<
    VideoScene,
    "id" | "scene_order" | "duration_seconds"
  > & { created_at: string })[];

  if (scenes.length < 2) {
    return;
  }

  const newest = scenes.reduce((latest, scene) =>
    scene.created_at > latest.created_at ? scene : latest,
  );
  const anchor = scenes.findIndex((scene) => scene.id === afterSceneId);
  if (anchor === -1 || newest.id === afterSceneId) {
    return;
  }

  const without = scenes.filter((scene) => scene.id !== newest.id);
  const at = without.findIndex((scene) => scene.id === afterSceneId);
  without.splice(at + 1, 0, newest);

  const offset = without.length + 1000;
  for (const [index, scene] of without.entries()) {
    await supabase
      .from("video_scenes")
      .update({ scene_order: offset + index })
      .eq("id", scene.id)
      .eq("owner_id", user.id);
  }
  for (const [index, scene] of without.entries()) {
    await supabase
      .from("video_scenes")
      .update({ scene_order: index + 1 })
      .eq("id", scene.id)
      .eq("owner_id", user.id);
  }
}

// ---------------------------------------------------------------------------
// Production asset slots
// ---------------------------------------------------------------------------

export async function setProductionAsset(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  if (typeof projectId !== "string") {
    return;
  }

  const parsed = parseProductionAssetForm(productionAssetValuesFrom(formData));
  if (!parsed.success) {
    redirect(`${editorPath(projectId)}?notice=slot-invalid`);
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  await supabase.from("production_assets").upsert(
    {
      ...parsed.data,
      notes: parsed.data.notes ?? null,
      project_id: projectId,
      owner_id: user.id,
    },
    { onConflict: "project_id,role" },
  );

  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=slot-saved`);
}

export async function clearProductionAsset(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const role = formData.get("role");
  if (typeof projectId !== "string" || typeof role !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  await supabase
    .from("production_assets")
    .delete()
    .eq("project_id", projectId)
    .eq("role", role)
    .eq("owner_id", user.id);

  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=slot-cleared`);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Ask for a render.
 *
 * Stage 11 connected a real provider (Remotion, `src/lib/render/`). When the
 * runtime is configured for rendering the request is **accepted** and
 * recorded as `queued` — and only the render worker may advance it from
 * there. When it is not configured, the refusal is recorded as a **failed**
 * job with the reason attached, exactly as it has been since Stage 4: a
 * queued job nothing will pick up would read as work in progress.
 */
export async function requestProjectRender(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  if (typeof projectId !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const { data: full } = await supabase
    .from("video_projects")
    .select("id, name, current_revision, aspect_ratio")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  const { data: scenes } = await supabase
    .from("video_scenes")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("scene_order", { ascending: true });

  const outcome = await requestRender({
    project: {
      id: full!.id as string,
      name: full!.name as string,
      current_revision: full!.current_revision as number,
    },
    aspectRatio: full!.aspect_ratio as "9:16" | "16:9" | "1:1",
    scenes: (scenes ?? []) as VideoScene[],
  });

  const provider = getRenderProvider();

  const { data: jobRow } = await supabase
    .from("render_jobs")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      project_revision: (full!.current_revision as number) ?? 1,
      provider: outcome.accepted && provider ? provider.id : "none",
      // An accepted job starts as `queued` and only the worker may advance
      // it. A refusal is a recorded failure, never a silent nothing.
      status: outcome.accepted ? "queued" : "failed",
      failure_reason: outcome.accepted ? null : outcome.reason,
      completed_at: null,
    })
    .select("id")
    .single();

  if (jobRow) {
    await recordAudit(
      "render_requested",
      "render_job",
      (jobRow as { id: string }).id,
      { accepted: outcome.accepted },
    );
  }

  revalidatePath(editorPath(projectId));
  redirect(
    `${editorPath(projectId)}?notice=${outcome.accepted ? "render-queued" : "render-refused"}`,
  );
}

/**
 * Process the render queue now.
 *
 * The manual counterpart to the Trigger.dev sweep, mirroring how analytics
 * refresh works: no scheduler needs to be deployed for Dave to get his own
 * render. This is a long request by nature — rendering is slow — and it only
 * exists because the runtime operator explicitly enabled rendering.
 */
export async function processRenderQueueNow(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  if (typeof projectId !== "string") {
    return;
  }

  const { project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const { client } = createWorkerClient();
  if (client !== null) {
    await processQueuedRenderJobs(client);
  }

  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=render-processed`);
}

/**
 * Reconcile a job stuck in `rendering` after a crash: recover the output if
 * it exists, otherwise record the crash honestly.
 */
export async function reconcileRender(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const jobId = formData.get("job_id");
  if (typeof projectId !== "string" || typeof jobId !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  // Ownership proved through the session before the worker credential acts.
  const { data: owned } = await supabase
    .from("render_jobs")
    .select("id")
    .eq("id", jobId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (owned) {
    const { client } = createWorkerClient();
    if (client !== null) {
      await reconcileRenderJob(client, jobId);
    }
  }

  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=render-reconciled`);
}

/**
 * Cancel a queued or in-flight render. Cancellation stops future work and
 * keeps every record; it deletes nothing and completes nothing.
 */
export async function cancelRender(formData: FormData): Promise<void> {
  const projectId = formData.get("project_id");
  const jobId = formData.get("job_id");
  if (typeof projectId !== "string" || typeof jobId !== "string") {
    return;
  }

  const { supabase, user, project } = await ownedProject(projectId);
  if (!project) {
    redirect(VIDEO_PATH);
  }

  const { data: cancelled } = await supabase
    .from("render_jobs")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("owner_id", user.id)
    .in("status", ["queued", "rendering"])
    .select("id");

  if (cancelled && cancelled.length > 0) {
    await recordAudit("render_cancelled", "render_job", jobId, {});
  }

  revalidatePath(editorPath(projectId));
  redirect(`${editorPath(projectId)}?notice=render-cancelled`);
}
