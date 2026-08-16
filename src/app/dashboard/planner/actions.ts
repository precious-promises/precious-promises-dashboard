"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  parsePlannerForm,
  plannerValuesFrom,
  type PlannerFieldErrors,
} from "@/lib/planner/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Planner write paths.
 *
 * Planning is intent. Nothing here writes to scheduling, publishing or
 * approval tables, and linking a content item is the only bridge an item has
 * to the production path.
 */

const PLANNER_PATH = "/dashboard/planner";

export interface PlannerActionState {
  error?: string;
  notice?: string;
  fieldErrors?: PlannerFieldErrors;
}

export async function createPlannerItem(
  _previous: PlannerActionState,
  formData: FormData,
): Promise<PlannerActionState> {
  const parsed = parsePlannerForm(plannerValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  // A linked content item must be the owner's. RLS would also refuse, but a
  // named error beats a silent one.
  if (parsed.data.content_item_id !== null) {
    const { data: item } = await supabase
      .from("content_items")
      .select("id")
      .eq("id", parsed.data.content_item_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!item) {
      return { error: "That linked content item could not be found." };
    }
  }

  const { data, error } = await supabase
    .from("planner_items")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "The plan item could not be saved." };
  }

  await recordAudit(
    "planner_item_created",
    "planner_item",
    (data as { id: string }).id,
    { status: parsed.data.status },
  );

  revalidatePath(PLANNER_PATH);
  return { notice: "Planned. This is intent, not a schedule." };
}

export async function updatePlannerItem(
  _previous: PlannerActionState,
  formData: FormData,
): Promise<PlannerActionState> {
  const itemId = formData.get("planner_item_id");
  if (typeof itemId !== "string" || itemId === "") {
    return { error: "That plan item could not be found." };
  }

  const parsed = parsePlannerForm(plannerValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (parsed.data.content_item_id !== null) {
    const { data: item } = await supabase
      .from("content_items")
      .select("id")
      .eq("id", parsed.data.content_item_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!item) {
      return { error: "That linked content item could not be found." };
    }
  }

  const { data, error } = await supabase
    .from("planner_items")
    .update(parsed.data)
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .select("id");

  if (error || !data || data.length === 0) {
    return { error: "The plan item could not be updated." };
  }

  await recordAudit("planner_item_updated", "planner_item", itemId, {
    status: parsed.data.status,
  });

  revalidatePath(PLANNER_PATH);
  return { notice: "Plan updated." };
}

export async function deletePlannerItem(formData: FormData): Promise<void> {
  const itemId = formData.get("planner_item_id");
  if (typeof itemId !== "string" || itemId === "") {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data } = await supabase
    .from("planner_items")
    .delete()
    .eq("id", itemId)
    .eq("owner_id", user.id)
    .select("id");

  if (data && data.length > 0) {
    await recordAudit("planner_item_deleted", "planner_item", itemId, {});
  }

  revalidatePath(PLANNER_PATH);
  redirect(PLANNER_PATH);
}
