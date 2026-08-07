import { z } from "zod";

import {
  CONTENT_STATUSES,
  CONTENT_TYPES,
  DEFAULT_SCRIPTURE_TRANSLATION,
} from "./types";

/**
 * Validation for content authoring.
 *
 * **`owner_id` is deliberately absent from every schema in this file.**
 * Ownership comes from the authenticated server session and nowhere else. If a
 * client could submit an `owner_id`, it could write rows attributed to another
 * user — RLS would reject most of it, but the schema should not even offer the
 * shape. `contentFormSchema` strips unknown keys, so a smuggled `owner_id`
 * never reaches the database layer.
 */

/** Blank form fields arrive as "" and mean "not provided". */
const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

export const contentFormSchema = z.object({
  title: z
    .string({ error: "Enter a title" })
    .trim()
    .min(1, { error: "Enter a title" })
    .max(200, { error: "Title must be 200 characters or fewer" }),

  content_type: z.enum(CONTENT_TYPES, {
    error: "Choose a content type",
  }),

  topic: optionalText(120),

  // Scripture is captured exactly as entered. Nothing here reformats,
  // expands, corrects or completes it — see AGENTS.md.
  scripture_reference: optionalText(160),
  scripture_text: optionalText(5000),

  scripture_translation: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .default(DEFAULT_SCRIPTURE_TRANSLATION),

  // Declarations, prayers and commentary belong here, never in
  // scripture_text — they are a different content type and must stay
  // distinguishable in the data.
  description: optionalText(5000),
});

export type ContentFormInput = z.input<typeof contentFormSchema>;
export type ContentFormValues = z.output<typeof contentFormSchema>;

/** Editing accepts the same fields plus an explicit status change. */
export const contentUpdateSchema = contentFormSchema.extend({
  status: z.enum(CONTENT_STATUSES),
});

export type ContentUpdateValues = z.output<typeof contentUpdateSchema>;

export type ContentFieldErrors = Partial<
  Record<keyof ContentFormValues | "status", string>
>;

export type ContentParseResult<T> =
  | { success: true; data: T }
  | { success: false; fieldErrors: ContentFieldErrors };

function collectFieldErrors(error: z.ZodError): ContentFieldErrors {
  const fieldErrors: ContentFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      (fieldErrors as Record<string, string>)[field] = issue.message;
    }
  }
  return fieldErrors;
}

/** Validate a create submission. Never throws; the form renders the errors. */
export function parseContentForm(
  input: unknown,
): ContentParseResult<ContentFormValues> {
  const result = contentFormSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, fieldErrors: collectFieldErrors(result.error) };
}

/** Validate an edit submission. */
export function parseContentUpdate(
  input: unknown,
): ContentParseResult<ContentUpdateValues> {
  const result = contentUpdateSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, fieldErrors: collectFieldErrors(result.error) };
}

/** Read a content form out of a FormData payload. */
export function contentFormValuesFrom(formData: FormData): unknown {
  return {
    title: formData.get("title"),
    content_type: formData.get("content_type"),
    topic: formData.get("topic"),
    scripture_reference: formData.get("scripture_reference"),
    scripture_text: formData.get("scripture_text"),
    scripture_translation:
      formData.get("scripture_translation") ?? DEFAULT_SCRIPTURE_TRANSLATION,
    description: formData.get("description"),
  };
}
