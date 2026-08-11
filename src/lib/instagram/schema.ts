import { z } from "zod";

import { INSTAGRAM_MEDIA_TYPES } from "./config";

/**
 * The Instagram settings form.
 *
 * Note what is **not** enforced here: that the chosen media type is one this
 * application can actually publish. A variant may be saved as an image — the
 * refusal belongs at publish time and in the approval blockers, where it can
 * be explained, rather than as a validation error that reads like a typo.
 *
 * The same `null`-handling as the variant schema, for the same reason:
 * `FormData.get` returns `null` for a field that was not submitted.
 */

function blankToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

const optionalId = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
);

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

export const instagramMetadataSchema = z.object({
  media_type: z.enum(INSTAGRAM_MEDIA_TYPES),
  cover_media_asset_id: optionalId,
  share_to_feed: checkbox,
});

export type InstagramMetadataValues = z.infer<typeof instagramMetadataSchema>;
export type InstagramFieldErrors = Partial<
  Record<keyof InstagramMetadataValues, string>
>;

export function instagramValuesFrom(
  formData: FormData,
): Record<string, unknown> {
  return {
    media_type: formData.get("media_type"),
    cover_media_asset_id: formData.get("cover_media_asset_id"),
    share_to_feed: formData.get("share_to_feed"),
  };
}

export type InstagramParseResult =
  | { success: true; data: InstagramMetadataValues }
  | { success: false; fieldErrors: InstagramFieldErrors };

export function parseInstagramMetadataForm(
  values: Record<string, unknown>,
): InstagramParseResult {
  const result = instagramMetadataSchema.safeParse(values);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: InstagramFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof InstagramMetadataValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
