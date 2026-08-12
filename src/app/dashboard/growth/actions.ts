"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  EXPERIMENT_DIMENSIONS,
  EXPERIMENT_STATUSES,
} from "@/lib/growth/experiments";
import { GOAL_METRICS, GOAL_STATUSES } from "@/lib/growth/goals";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Growth write paths.
 *
 * Goals and experiments are the only things in the Growth Centre a person can
 * write, and both are records of **intent** rather than measurement. They live
 * in their own tables for that reason: no chart can accidentally plot a target
 * as an observation, and no experiment conclusion can be computed on the
 * owner's behalf.
 *
 * Nothing here approves, schedules or publishes anything.
 */

const GROWTH_PATH = "/dashboard/growth";

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalText = (max: number) =>
  z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .max(max)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  );

const optionalDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
);

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalSchema = z
  .object({
    name: z.string().trim().min(1, "Give this goal a name.").max(200),
    metric: z.enum(GOAL_METRICS),
    platform: z.preprocess(
      blankToUndefined,
      z
        .enum(["youtube", "instagram", "tiktok"])
        .nullable()
        .optional()
        .transform((value) => value ?? null),
    ),
    target_value: z.preprocess(
      (value) => (typeof value === "string" ? Number(value.trim()) : value),
      z
        .number()
        .finite("Enter a number.")
        .positive("A target must be above zero."),
    ),
    period_start: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
    period_end: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
    notes: optionalText(2000),
  })
  .refine((values) => values.period_end >= values.period_start, {
    path: ["period_end"],
    message: "The end date cannot be before the start date.",
  });

export type GoalValues = z.infer<typeof goalSchema>;
export type GoalFieldErrors = Partial<Record<keyof GoalValues, string>>;

export interface GoalActionState {
  error?: string;
  notice?: string;
  fieldErrors?: GoalFieldErrors;
}

function fieldErrorsFrom<T>(
  error: z.ZodError,
): Partial<Record<keyof T, string>> {
  const fieldErrors: Partial<Record<keyof T, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof T] = issue.message;
    }
  }
  return fieldErrors;
}

export async function createGoal(
  _previous: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = goalSchema.safeParse({
    name: formData.get("name"),
    metric: formData.get("metric"),
    platform: formData.get("platform"),
    target_value: formData.get("target_value"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom<GoalValues>(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data, error } = await supabase
    .from("growth_goals")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "That goal could not be saved." };
  }

  await recordAudit(
    "growth_goal_created",
    "growth_goal",
    (data as { id: string }).id,
    { metric: parsed.data.metric, platform: parsed.data.platform },
  );

  revalidatePath(GROWTH_PATH);
  return { notice: "Goal set. It is a target, not a prediction." };
}

const goalStatusSchema = z.object({
  goal_id: z.string().uuid(),
  status: z.enum(GOAL_STATUSES),
});

export async function updateGoalStatus(
  _previous: GoalActionState,
  formData: FormData,
): Promise<GoalActionState> {
  const parsed = goalStatusSchema.safeParse({
    goal_id: formData.get("goal_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "That goal could not be updated." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { error } = await supabase
    .from("growth_goals")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.goal_id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "That goal could not be updated." };
  }

  await recordAudit("growth_goal_updated", "growth_goal", parsed.data.goal_id, {
    status: parsed.data.status,
  });

  revalidatePath(GROWTH_PATH);
  return { notice: "Goal updated." };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

const experimentSchema = z.object({
  name: z.string().trim().min(1, "Give this experiment a name.").max(200),
  hypothesis: z
    .string()
    .trim()
    .min(
      1,
      "Write down what you expect to see. Without it there is nothing to check against.",
    )
    .max(2000),
  dimension: z.enum(EXPERIMENT_DIMENSIONS),
  started_on: optionalDate,
  notes: optionalText(4000),
});

export type ExperimentValues = z.infer<typeof experimentSchema>;
export type ExperimentFieldErrors = Partial<
  Record<keyof ExperimentValues, string>
>;

export interface ExperimentActionState {
  error?: string;
  notice?: string;
  fieldErrors?: ExperimentFieldErrors;
}

export async function createExperiment(
  _previous: ExperimentActionState,
  formData: FormData,
): Promise<ExperimentActionState> {
  const parsed = experimentSchema.safeParse({
    name: formData.get("name"),
    hypothesis: formData.get("hypothesis"),
    dimension: formData.get("dimension"),
    started_on: formData.get("started_on"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom<ExperimentValues>(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data, error } = await supabase
    .from("growth_experiments")
    .insert({
      ...parsed.data,
      owner_id: user.id,
      status: parsed.data.started_on ? "running" : "planned",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "That experiment could not be saved." };
  }

  await recordAudit(
    "growth_experiment_created",
    "growth_experiment",
    (data as { id: string }).id,
    { dimension: parsed.data.dimension },
  );

  revalidatePath(GROWTH_PATH);
  return {
    notice:
      "Experiment recorded. It is observational — these platforms offer no randomised assignment.",
  };
}

const concludeSchema = z.object({
  experiment_id: z.string().uuid(),
  status: z.enum(EXPERIMENT_STATUSES),
  observation: optionalText(4000),
  ended_on: optionalDate,
});

/**
 * Finish an experiment.
 *
 * **The owner writes the conclusion.** Nothing here computes a winner, and
 * nothing auto-advances an experiment to `observed`. The system can show what
 * the numbers did; deciding what it means over a handful of posts that differ
 * in more than one respect is a judgement, and one a human makes.
 */
export async function concludeExperiment(
  _previous: ExperimentActionState,
  formData: FormData,
): Promise<ExperimentActionState> {
  const parsed = concludeSchema.safeParse({
    experiment_id: formData.get("experiment_id"),
    status: formData.get("status"),
    observation: formData.get("observation"),
    ended_on: formData.get("ended_on"),
  });

  if (!parsed.success) {
    return { error: "That experiment could not be updated." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  // The database refuses `observed` or `inconclusive` without a start date, so
  // an experiment that never ran cannot be concluded. Checked here too, so the
  // owner gets a sentence rather than a constraint violation.
  const { data: existing } = await supabase
    .from("growth_experiments")
    .select("started_on")
    .eq("id", parsed.data.experiment_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const startedOn = (existing as { started_on: string | null } | null)
    ?.started_on;

  if (
    (parsed.data.status === "observed" ||
      parsed.data.status === "inconclusive") &&
    !startedOn
  ) {
    return {
      error:
        "This experiment has no start date, so there is nothing to have observed. Set a start date first.",
    };
  }

  const { error } = await supabase
    .from("growth_experiments")
    .update({
      status: parsed.data.status,
      observation: parsed.data.observation,
      ended_on: parsed.data.ended_on ?? new Date().toISOString().slice(0, 10),
    })
    .eq("id", parsed.data.experiment_id)
    .eq("owner_id", user.id);

  if (error) {
    return { error: "That experiment could not be updated." };
  }

  await recordAudit(
    "growth_experiment_completed",
    "growth_experiment",
    parsed.data.experiment_id,
    { status: parsed.data.status },
  );

  revalidatePath(GROWTH_PATH);
  return { notice: "Experiment concluded, in your own words." };
}
