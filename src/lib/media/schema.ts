import { z } from "zod";

import { MEDIA_TYPES, RIGHTS_STATUSES, STORAGE_PROVIDERS } from "./types";

/**
 * Media asset metadata validation.
 *
 * As with content, **`owner_id` is absent by design** — it comes from the
 * authenticated session, never from a submission.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

/** Positive integers arriving from a form as strings. */
const optionalPositiveInt = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}, z.number().int().nonnegative().optional());

export const mediaFormSchema = z.object({
  name: z
    .string({ error: "Enter a name" })
    .trim()
    .min(1, { error: "Enter a name" })
    .max(200, { error: "Name must be 200 characters or fewer" }),

  media_type: z.enum(MEDIA_TYPES, { error: "Choose a media type" }),

  storage_provider: z.enum(STORAGE_PROVIDERS, {
    error: "Choose where the file is stored",
  }),

  external_file_id: optionalText(255),

  external_url: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .url({
        protocol: /^https?$/,
        error: "Enter a valid http(s) URL",
      })
      .optional(),
  ),

  mime_type: optionalText(160),
  size_bytes: optionalPositiveInt,
  width: optionalPositiveInt,
  height: optionalPositiveInt,
  duration_seconds: optionalPositiveInt,

  rights_status: z.enum(RIGHTS_STATUSES).default("unknown"),
});

export type MediaFormValues = z.output<typeof mediaFormSchema>;

export type MediaFieldErrors = Partial<Record<keyof MediaFormValues, string>>;

export type MediaParseResult =
  | { success: true; data: MediaFormValues }
  | { success: false; fieldErrors: MediaFieldErrors };

export function parseMediaForm(input: unknown): MediaParseResult {
  const result = mediaFormSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: MediaFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      (fieldErrors as Record<string, string>)[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
