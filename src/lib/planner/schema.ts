import { z } from "zod";

import { PLANNER_PRIORITIES, PLANNER_STATUSES } from "./types";

/**
 * Planner form validation. As everywhere: no `owner_id` in any schema, blank
 * strings mean "not provided", and nothing here can name a schedule.
 */

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
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

export const plannerItemSchema = z.object({
  title: z.string().trim().min(1, "Give this plan a title.").max(200),
  topic: optionalText(100),
  content_type: optionalText(60),
  target_platforms: z
    .array(z.enum(["youtube", "instagram", "tiktok"]))
    .default([]),
  target_date: optionalDate,
  priority: z.enum(PLANNER_PRIORITIES).default("normal"),
  status: z.enum(PLANNER_STATUSES).default("idea"),
  series: optionalText(100),
  notes: optionalText(2000),
  content_item_id: z.preprocess(
    blankToUndefined,
    z
      .string()
      .uuid()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  ),
});

export type PlannerItemValues = z.infer<typeof plannerItemSchema>;
export type PlannerFieldErrors = Partial<
  Record<keyof PlannerItemValues, string>
>;

export function plannerValuesFrom(formData: FormData): Record<string, unknown> {
  return {
    title: formData.get("title"),
    topic: formData.get("topic"),
    content_type: formData.get("content_type"),
    target_platforms: formData.getAll("target_platforms"),
    target_date: formData.get("target_date"),
    priority: formData.get("priority") ?? undefined,
    status: formData.get("status") ?? undefined,
    series: formData.get("series"),
    notes: formData.get("notes"),
    content_item_id: formData.get("content_item_id"),
  };
}

export type PlannerParseResult =
  | { success: true; data: PlannerItemValues }
  | { success: false; fieldErrors: PlannerFieldErrors };

export function parsePlannerForm(
  values: Record<string, unknown>,
): PlannerParseResult {
  const result = plannerItemSchema.safeParse(values);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: PlannerFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof PlannerItemValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
