import { z } from "zod";

import {
  EDITABLE_REVIEW_STATES,
  isVariantTypeForPlatform,
  VARIANT_PLATFORMS,
  VARIANT_TYPES,
} from "./types";

/**
 * Platform variant validation.
 *
 * No `owner_id`, no `content_item_id` and no Scripture fields — ownership and
 * the parent item come from the server, and a variant cannot carry a verse.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

/**
 * Hashtags arrive as one free-text field and are split here.
 *
 * Leading `#` is stripped so the stored value is the tag itself, and
 * duplicates are removed — a repeated tag is a typo, not an intention. The
 * order the owner typed is preserved.
 */
export function parseHashtagInput(raw: unknown): string[] {
  if (typeof raw !== "string") {
    return [];
  }

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const piece of raw.split(/[\s,]+/)) {
    const tag = piece.trim().replace(/^#+/, "");
    if (tag === "") {
      continue;
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/**
 * The field shape, exported separately.
 *
 * `variantFormSchema` wraps this in a `.refine()`, which hides `.shape` behind
 * internals. Tests assert on the field list, so the object is named here
 * rather than reached for through `_def`.
 */
export const variantObjectSchema = z.object({
  platform: z.enum(VARIANT_PLATFORMS, { error: "Choose a platform" }),
  variant_type: z.enum(VARIANT_TYPES, { error: "Choose a variant type" }),
  title: optionalText(300),
  caption: optionalText(5000),
  description: optionalText(10000),
  hashtags: z.array(z.string().trim().min(1).max(100)).max(60).default([]),
  first_comment: optionalText(3000),
  cta: optionalText(500),
  thumbnail_text: optionalText(200),
  // Editable states only. `approved` and `rejected` are decisions taken in the
  // Approval Queue with their own eligibility checks and fingerprint; a form
  // that could post them would bypass both.
  review_state: z.enum(EDITABLE_REVIEW_STATES).default("draft"),
});

export const variantFormSchema = variantObjectSchema.refine(
  (values) => isVariantTypeForPlatform(values.platform, values.variant_type),
  {
    error: "That variant type does not belong to the chosen platform",
    path: ["variant_type"],
  },
);

export type VariantFormValues = z.output<typeof variantFormSchema>;

export type VariantFieldErrors = Partial<
  Record<keyof VariantFormValues, string>
>;

export type VariantParseResult =
  | { success: true; data: VariantFormValues }
  | { success: false; fieldErrors: VariantFieldErrors };

export function parseVariantForm(input: unknown): VariantParseResult {
  const result = variantFormSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: VariantFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      (fieldErrors as Record<string, string>)[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

/** Read a variant out of a FormData payload. */
export function variantValuesFrom(formData: FormData): unknown {
  return {
    platform: formData.get("platform"),
    variant_type: formData.get("variant_type"),
    title: formData.get("title"),
    caption: formData.get("caption"),
    description: formData.get("description"),
    hashtags: parseHashtagInput(formData.get("hashtags")),
    first_comment: formData.get("first_comment"),
    cta: formData.get("cta"),
    thumbnail_text: formData.get("thumbnail_text"),
    review_state: formData.get("review_state") ?? "draft",
  };
}
