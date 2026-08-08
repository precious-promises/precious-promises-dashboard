"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadReviewRow } from "@/lib/approvals/repository";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { listSchedulesForVariant } from "@/lib/schedule/repository";
import {
  canTransitionSchedule,
  findDuplicateSchedule,
  scheduleBlockers,
} from "@/lib/schedule/rules";
import {
  parseRecurringRuleForm,
  parseScheduleForm,
  recurringRuleValuesFrom,
  scheduleValuesFrom,
  type ScheduleFieldErrors,
} from "@/lib/schedule/schema";
import { zonedTimeToUtc } from "@/lib/schedule/timezone";
import { SCHEDULE_PRESETS } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Scheduling.
 *
 * **Nothing here publishes, and nothing executes a schedule.** These actions
 * write a row saying when the owner intends something to go out. No worker
 * reads those rows and no platform integration exists.
 *
 * The safety rule that matters: approval and its fingerprint are re-checked
 * **here**, against records loaded in this request. The page may have been
 * rendered minutes ago and the content edited since; its opinion is not
 * evidence.
 */

const CALENDAR_PATH = "/dashboard/calendar";

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

export interface ScheduleActionState {
  error?: string;
  /** Set when an identical schedule already exists; resubmitting confirms. */
  duplicateWarning?: string;
  fieldErrors?: ScheduleFieldErrors;
}

export async function schedulePost(
  _previous: ScheduleActionState,
  formData: FormData,
): Promise<ScheduleActionState> {
  const parsed = parseScheduleForm(scheduleValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors as ScheduleFieldErrors };
  }

  const { supabase, user } = await requireUser();

  // Loaded fresh: this recomputes the fingerprint from stored records.
  const row = await loadReviewRow(parsed.data.platform_variant_id);
  if (!row) {
    return { error: "That platform variant could not be found." };
  }

  const scheduledFor = zonedTimeToUtc(
    parsed.data.date,
    parsed.data.time,
    parsed.data.timezone,
  );

  const blockers = scheduleBlockers({
    variant: row.variant,
    approvalMatches: row.validity === "valid",
    scheduledFor,
    now: new Date(),
  });

  if (blockers.length > 0) {
    return { error: blockers[0]!.message };
  }

  const existing = await listSchedulesForVariant(row.variant.id);
  const duplicate = findDuplicateSchedule(
    existing,
    row.variant.id,
    scheduledFor!,
  );

  if (duplicate && formData.get("confirm_duplicate") !== "on") {
    return {
      duplicateWarning:
        "This variant is already scheduled for that exact time. Tick the box to schedule it anyway.",
    };
  }

  const { data, error } = await supabase
    .from("scheduled_posts")
    .insert({
      owner_id: user.id,
      platform_variant_id: row.variant.id,
      scheduled_for: scheduledFor!.toISOString(),
      timezone: parsed.data.timezone,
      status: "scheduled",
      // The hash computed in this request, never one supplied by the form.
      approval_hash: row.currentFingerprint,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not schedule this. Please try again." };
  }

  await recordAudit("post_scheduled", "scheduled_post", data.id as string, {
    platform: row.variant.platform,
    scheduled_for: scheduledFor!.toISOString(),
    timezone: parsed.data.timezone,
  });

  revalidatePath(CALENDAR_PATH);
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/production");
  redirect(`${CALENDAR_PATH}?notice=scheduled`);
}

export async function cancelSchedule(formData: FormData): Promise<void> {
  const postId = formData.get("scheduled_post_id");
  const reason = formData.get("reason");

  if (typeof postId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();

  const { data: post } = await supabase
    .from("scheduled_posts")
    .select("id, status, scheduled_for")
    .eq("id", postId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!post) {
    redirect(CALENDAR_PATH);
  }

  if (
    !canTransitionSchedule(
      post.status as "scheduled" | "paused" | "cancelled",
      "cancelled",
    )
  ) {
    redirect(`${CALENDAR_PATH}?notice=transition-refused`);
  }

  const text =
    typeof reason === "string" && reason.trim() !== ""
      ? reason.trim().slice(0, 2000)
      : "Cancelled by the owner.";

  await supabase
    .from("scheduled_posts")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: text,
      paused_at: null,
      pause_reason: null,
    })
    .eq("id", postId)
    .eq("owner_id", user.id);

  await recordAudit("schedule_cancelled", "scheduled_post", postId, {
    reason: text,
  });

  revalidatePath(CALENDAR_PATH);
  redirect(`${CALENDAR_PATH}?notice=cancelled`);
}

/**
 * Reinstate a paused schedule.
 *
 * Only ever an explicit action, and only when the variant is approved again
 * with a fingerprint that matches. A paused schedule never resumes on its own
 * — that is the whole point of pausing it.
 */
export async function resumeSchedule(formData: FormData): Promise<void> {
  const postId = formData.get("scheduled_post_id");
  if (typeof postId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();

  const { data: post } = await supabase
    .from("scheduled_posts")
    .select("id, status, platform_variant_id, scheduled_for")
    .eq("id", postId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!post) {
    redirect(CALENDAR_PATH);
  }

  if (
    !canTransitionSchedule(
      post.status as "scheduled" | "paused" | "cancelled",
      "scheduled",
    )
  ) {
    redirect(`${CALENDAR_PATH}?notice=transition-refused`);
  }

  const row = await loadReviewRow(post.platform_variant_id as string);
  if (!row || row.validity !== "valid") {
    redirect(`${CALENDAR_PATH}?notice=resume-refused`);
  }

  if (new Date(post.scheduled_for as string).getTime() <= Date.now()) {
    redirect(`${CALENDAR_PATH}?notice=resume-past`);
  }

  await supabase
    .from("scheduled_posts")
    .update({
      status: "scheduled",
      paused_at: null,
      pause_reason: null,
      // Re-stamped with the approval it is now resting on.
      approval_hash: row.currentFingerprint,
    })
    .eq("id", postId)
    .eq("owner_id", user.id);

  revalidatePath(CALENDAR_PATH);
  redirect(`${CALENDAR_PATH}?notice=resumed`);
}

// ---------------------------------------------------------------------------
// Recurring slots
// ---------------------------------------------------------------------------

export async function saveRecurringRule(formData: FormData): Promise<void> {
  const parsed = parseRecurringRuleForm(recurringRuleValuesFrom(formData));
  if (!parsed.success) {
    redirect(`${CALENDAR_PATH}?notice=slot-invalid`);
  }

  const { supabase, user } = await requireUser();
  const ruleId = formData.get("rule_id");
  const isUpdate = typeof ruleId === "string" && ruleId !== "";

  const values = {
    ...parsed.data,
    content_type: parsed.data.content_type ?? null,
    local_time: `${parsed.data.local_time}:00`,
    owner_id: user.id,
  };

  if (isUpdate) {
    const { error } = await supabase
      .from("recurring_schedule_rules")
      .update(values)
      .eq("id", ruleId)
      .eq("owner_id", user.id);

    if (error) {
      redirect(`${CALENDAR_PATH}?notice=slot-failed`);
    }

    await recordAudit(
      "recurring_rule_updated",
      "recurring_schedule_rule",
      ruleId,
      { name: parsed.data.name, enabled: parsed.data.enabled },
    );
  } else {
    const { data, error } = await supabase
      .from("recurring_schedule_rules")
      .insert(values)
      .select("id")
      .single();

    if (error || !data) {
      redirect(`${CALENDAR_PATH}?notice=slot-duplicate`);
    }

    await recordAudit(
      "recurring_rule_created",
      "recurring_schedule_rule",
      data.id as string,
      { name: parsed.data.name, enabled: parsed.data.enabled },
    );
  }

  revalidatePath(CALENDAR_PATH);
  redirect(`${CALENDAR_PATH}?notice=slot-saved`);
}

export async function toggleRecurringRule(formData: FormData): Promise<void> {
  const ruleId = formData.get("rule_id");
  if (typeof ruleId !== "string") {
    return;
  }

  const { supabase, user } = await requireUser();

  const { data: rule } = await supabase
    .from("recurring_schedule_rules")
    .select("id, enabled, name")
    .eq("id", ruleId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!rule) {
    redirect(CALENDAR_PATH);
  }

  await supabase
    .from("recurring_schedule_rules")
    .update({ enabled: !rule.enabled })
    .eq("id", ruleId)
    .eq("owner_id", user.id);

  await recordAudit(
    "recurring_rule_updated",
    "recurring_schedule_rule",
    ruleId,
    { name: rule.name as string, enabled: !rule.enabled },
  );

  revalidatePath(CALENDAR_PATH);
  redirect(`${CALENDAR_PATH}?notice=slot-toggled`);
}

/**
 * Create the Precious Promises rhythm as editable slots.
 *
 * Every rule is created **disabled**, and creating them schedules nothing.
 * A slot is a time that could be used, not permission to publish into it.
 */
export async function createPresetRules(): Promise<void> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("recurring_schedule_rules")
    .select("name")
    .eq("owner_id", user.id);

  const taken = new Set(
    ((existing ?? []) as { name: string }[]).map((rule) => rule.name),
  );

  const rows = SCHEDULE_PRESETS.filter((preset) => !taken.has(preset.name)).map(
    (preset) => ({
      owner_id: user.id,
      name: preset.name,
      platform: preset.platform,
      content_type: preset.contentType,
      day_of_week: preset.dayOfWeek,
      local_time: `${preset.localTime}:00`,
      timezone: preset.timezone,
      enabled: false,
    }),
  );

  if (rows.length > 0) {
    await supabase.from("recurring_schedule_rules").insert(rows);
  }

  revalidatePath(CALENDAR_PATH);
  redirect(`${CALENDAR_PATH}?notice=presets-created`);
}
