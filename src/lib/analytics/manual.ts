import { z } from "zod";

import { METRIC_NAMES, OBSERVATION_WINDOWS } from "./types";

/**
 * Analytics entered by hand.
 *
 * Exists for one reason: **TikTok reports nothing this product can read.** Its
 * Display API returns metadata only, and the engagement figures live behind a
 * Research API restricted to academic institutions. Rather than showing Dave
 * permanently empty TikTok cards, he can copy the numbers out of the TikTok
 * app himself.
 *
 * ## The rule that makes this safe
 *
 * Manual data is **never disguised as API data**. Three things enforce that,
 * and only the last is a convention:
 *
 * 1. `source` is fixed to `manual` here and cannot be set by the caller.
 * 2. The database's insert policy permits `source = 'manual'` and nothing
 *    else from a browser session — so even a forged request cannot write an
 *    `instagram_api` row.
 * 3. Every surface that renders a figure shows its source.
 *
 * ## Manual never overwrites API
 *
 * The unique observation index includes `source`, so a manual entry and an API
 * reading for the same post, window and day are **separate rows**. Neither can
 * clobber the other, and both remain visible with their own provenance.
 */

/** The source manual entry always writes. Never a parameter. */
export const MANUAL_SOURCE = "manual" as const;

/** What the raw metric name records when a human typed the figure. */
export const MANUAL_RAW_NAME = "entered by hand";

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

/**
 * A metric value typed by a person.
 *
 * Non-negative and finite. A negative view count is a typo, and storing it
 * would poison every average it later fell into.
 */
const metricValue = z.preprocess(
  (value) => (typeof value === "string" ? Number(value.trim()) : value),
  z.number().finite("Enter a number.").min(0, "A metric cannot be negative."),
);

const optionalId = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
);

export const manualEntrySchema = z.object({
  platform: z.enum(["youtube", "instagram", "tiktok"]),

  /**
   * The platform's own id for the post.
   *
   * Required, and deliberately so. A figure with no post attached could not be
   * grouped, compared or checked against the platform later — it would be a
   * number floating free of anything that could verify it.
   */
  external_post_id: z
    .string()
    .trim()
    .min(1, "Enter the post id or URL from the platform.")
    .max(300),

  scheduled_post_id: optionalId,

  observation_window: z.enum(OBSERVATION_WINDOWS),

  /** When the figures were read off the platform, not when they were typed. */
  observed_on: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date you read these figures."),

  metric_name: z.enum(METRIC_NAMES),
  metric_value: metricValue,
});

export type ManualEntryValues = z.infer<typeof manualEntrySchema>;
export type ManualEntryFieldErrors = Partial<
  Record<keyof ManualEntryValues, string>
>;

export function manualEntryValuesFrom(
  formData: FormData,
): Record<string, unknown> {
  return {
    platform: formData.get("platform"),
    external_post_id: formData.get("external_post_id"),
    scheduled_post_id: formData.get("scheduled_post_id"),
    observation_window: formData.get("observation_window"),
    observed_on: formData.get("observed_on"),
    metric_name: formData.get("metric_name"),
    metric_value: formData.get("metric_value"),
  };
}

export type ManualEntryParseResult =
  | { success: true; data: ManualEntryValues }
  | { success: false; fieldErrors: ManualEntryFieldErrors };

export function parseManualEntry(
  values: Record<string, unknown>,
): ManualEntryParseResult {
  const result = manualEntrySchema.safeParse(values);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: ManualEntryFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof ManualEntryValues] = issue.message;
    }
  }

  return { success: false, fieldErrors };
}

/**
 * Which metrics are worth offering for hand entry, per platform.
 *
 * For TikTok this is what the app itself displays to a creator. For the other
 * two it is a fallback for a post the API could not reach — a deleted video
 * whose figures Dave noted before it went, for instance.
 */
export const MANUAL_METRIC_SUGGESTIONS = {
  tiktok: ["views_or_plays", "likes", "comments", "shares", "saves"],
  youtube: ["views_or_plays", "likes", "comments", "shares"],
  instagram: [
    "views_or_plays",
    "reach",
    "likes",
    "comments",
    "shares",
    "saves",
  ],
} as const;
