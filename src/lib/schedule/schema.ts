import { z } from "zod";

import { CONTENT_TYPES } from "@/lib/content/types";
import { VARIANT_PLATFORMS } from "@/lib/variants/types";

import { DEFAULT_TIMEZONE, isValidTimeZone } from "./timezone";

/**
 * Scheduling input validation.
 *
 * No `owner_id` and no `approval_hash`: ownership comes from the session, and
 * the fingerprint is recomputed on the server from stored records. A hash
 * accepted from a form would let a caller assert that stale content was
 * approved — which is the one thing this whole mechanism exists to prevent.
 */

const timezoneField = z
  .string({ error: "Choose a timezone" })
  .trim()
  .refine(isValidTimeZone, "That is not a recognised timezone")
  .default(DEFAULT_TIMEZONE);

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      value === null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.string().trim().max(max).optional(),
  );

export const scheduleFormSchema = z.object({
  platform_variant_id: z
    .string({ error: "Choose a platform variant" })
    .trim()
    .min(1, "Choose a platform variant"),
  date: z
    .string({ error: "Choose a date" })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z
    .string({ error: "Choose a time" })
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Choose a time in 24-hour format"),
  timezone: timezoneField,
});

export type ScheduleFormValues = z.output<typeof scheduleFormSchema>;
export type ScheduleFieldErrors = Partial<
  Record<keyof ScheduleFormValues, string>
>;

/**
 * A recurring rule defines a slot.
 *
 * There is no content field beyond an optional type hint, because a rule must
 * never be able to select what goes out. Approved content is assigned into a
 * slot by a person.
 */
export const recurringRuleFormSchema = z.object({
  name: z
    .string({ error: "Name this slot" })
    .trim()
    .min(1, "Name this slot")
    .max(120, "Keep the name under 120 characters"),
  platform: z.enum(VARIANT_PLATFORMS, { error: "Choose a platform" }),
  content_type: z.preprocess(
    (value) =>
      value === null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.enum(CONTENT_TYPES).optional(),
  ),
  day_of_week: z.preprocess(
    (value) => (typeof value === "string" ? Number(value) : value),
    z
      .number({ error: "Choose a day" })
      .int()
      .min(0, "Choose a day")
      .max(6, "Choose a day"),
  ),
  local_time: z
    .string({ error: "Choose a time" })
    .trim()
    .regex(/^\d{2}:\d{2}$/, "Choose a time in 24-hour format"),
  timezone: timezoneField,
  enabled: z.preprocess(
    (value) => value === "on" || value === true,
    z.boolean(),
  ),
});

export type RecurringRuleFormValues = z.output<typeof recurringRuleFormSchema>;
export type RecurringRuleFieldErrors = Partial<
  Record<keyof RecurringRuleFormValues, string>
>;

export const cancelScheduleSchema = z.object({
  scheduled_post_id: z.string().trim().min(1),
  reason: optionalText(2000),
});

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; fieldErrors: Partial<Record<string, string>> };

function collect<T>(result: z.ZodSafeParseResult<T>): ParseResult<T> {
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: Partial<Record<string, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

export function parseScheduleForm(
  input: unknown,
): ParseResult<ScheduleFormValues> {
  return collect(scheduleFormSchema.safeParse(input));
}

export function parseRecurringRuleForm(
  input: unknown,
): ParseResult<RecurringRuleFormValues> {
  return collect(recurringRuleFormSchema.safeParse(input));
}

export function scheduleValuesFrom(formData: FormData): unknown {
  return {
    platform_variant_id: formData.get("platform_variant_id"),
    date: formData.get("date"),
    time: formData.get("time"),
    timezone: formData.get("timezone") ?? DEFAULT_TIMEZONE,
  };
}

export function recurringRuleValuesFrom(formData: FormData): unknown {
  return {
    name: formData.get("name"),
    platform: formData.get("platform"),
    content_type: formData.get("content_type"),
    day_of_week: formData.get("day_of_week"),
    local_time: formData.get("local_time"),
    timezone: formData.get("timezone") ?? DEFAULT_TIMEZONE,
    enabled: formData.get("enabled") ?? false,
  };
}
