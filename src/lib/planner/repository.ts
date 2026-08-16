import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { PlannerItem } from "./types";

/** Owner-scoped reads; RLS enforces the same boundary underneath. */
export async function listPlannerItems(): Promise<PlannerItem[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("planner_items")
    .select("*")
    .eq("owner_id", user.id)
    .order("target_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as PlannerItem[];
}
