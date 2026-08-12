import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ExperimentPost, GrowthExperiment } from "./experiments";
import type { GrowthGoal } from "./goals";

/**
 * Reading goals and experiments.
 *
 * Kept apart from `goals.ts` and `experiments.ts` for a structural reason: the
 * goal and experiment **forms are client components**, and they import the
 * metric lists, dimension labels and status vocabulary from those modules. If a
 * loader that reaches for the server Supabase client lived alongside them, the
 * bundler would follow the import into the browser and fail — correctly, since
 * `next/headers` cannot exist there.
 *
 * So the pure domain stays pure, and everything that needs a session lives
 * here. Every read is scoped to the caller's own rows; RLS enforces the same
 * boundary underneath.
 */

export async function loadGoals(): Promise<GrowthGoal[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("growth_goals")
    .select("*")
    .eq("owner_id", user.id)
    .order("period_end", { ascending: true });

  return (data ?? []) as GrowthGoal[];
}

export async function loadExperiments(): Promise<GrowthExperiment[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("growth_experiments")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []) as GrowthExperiment[];
}

export async function loadExperimentPosts(
  experimentIds: string[],
): Promise<Map<string, ExperimentPost[]>> {
  if (experimentIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Map();
  }

  const { data } = await supabase
    .from("growth_experiment_posts")
    .select("id, experiment_id, scheduled_post_id, arm")
    .eq("owner_id", user.id)
    .in("experiment_id", experimentIds);

  const byExperiment = new Map<string, ExperimentPost[]>();
  for (const row of (data ?? []) as ExperimentPost[]) {
    const list = byExperiment.get(row.experiment_id) ?? [];
    list.push(row);
    byExperiment.set(row.experiment_id, list);
  }

  return byExperiment;
}
