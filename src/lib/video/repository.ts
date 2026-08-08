import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { RenderJob } from "./render";
import type { ProductionAsset, VideoProject, VideoScene } from "./types";

/**
 * Video studio data access.
 *
 * Runs with the caller's session, so RLS applies to every query. Ownership is
 * read from the session and never accepted as an argument — a function that
 * took an `ownerId` could be called with somebody else's.
 */

async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No authenticated user.");
  }
  return user.id;
}

export async function listVideoProjects(): Promise<VideoProject[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("video_projects")
    .select("*")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load video projects: ${error.message}`);
  }
  return (data ?? []) as VideoProject[];
}

/**
 * One project, or `null`.
 *
 * A project belonging to somebody else is indistinguishable from one that does
 * not exist, so a response cannot be used to discover which ids are real.
 */
export async function getVideoProject(
  id: string,
): Promise<VideoProject | null> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("video_projects")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as VideoProject | null) ?? null;
}

export async function listScenes(projectId: string): Promise<VideoScene[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("video_scenes")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("scene_order", { ascending: true });

  if (error) {
    throw new Error(`Could not load scenes: ${error.message}`);
  }
  return (data ?? []) as VideoScene[];
}

export async function listProductionAssets(
  projectId: string,
): Promise<ProductionAsset[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("production_assets")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("role", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as ProductionAsset[];
}

/** Every render request for a project, most recent first. */
export async function listRenderJobs(projectId: string): Promise<RenderJob[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("render_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("requested_at", { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }
  return (data ?? []) as RenderJob[];
}

/** How many video projects the owner has, for the dashboard. */
export async function countVideoProjects(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { count, error } = await supabase
    .from("video_projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .neq("status", "archived");

  if (error) {
    return 0;
  }
  return count ?? 0;
}
