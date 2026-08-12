import { z } from "zod";

import { DELIVERY_MODES, PRIVACY_LEVELS } from "./config";

/**
 * The TikTok settings form.
 *
 * Two things are deliberately **not** enforced here:
 *
 * 1. That the chosen privacy level is one TikTok currently offers this creator.
 *    That answer comes from a live API call, and a saved value can stop being
 *    valid later — so the refusal belongs at publish time and in the approval
 *    blockers, where it can be explained, rather than as a validation error
 *    that reads like a typo.
 * 2. That a direct post is permitted at all. Whether the client has passed
 *    TikTok's audit is not knowable from a form submission.
 *
 * What **is** enforced is coherence: no audience means no direct post, and a
 * brand declaration without the commercial disclosure is refused outright,
 * matching the database constraint rather than discovering it as a write error.
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

const optionalPrivacy = z.preprocess(
  blankToUndefined,
  z
    .enum(PRIVACY_LEVELS)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
);

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

const tiktokMetadataObject = z.object({
  delivery_mode: z.enum(DELIVERY_MODES),
  privacy_level: optionalPrivacy,
  disable_comment: checkbox,
  disable_duet: checkbox,
  disable_stitch: checkbox,
  is_commercial_content: checkbox,
  is_branded_content: checkbox,
  is_your_brand: checkbox,
});

export const tiktokMetadataSchema = tiktokMetadataObject
  .refine(
    (values) =>
      values.delivery_mode !== "direct_post" || values.privacy_level !== null,
    {
      path: ["privacy_level"],
      message:
        "A direct post needs an audience. Choose one of the options TikTok offers this account.",
    },
  )
  .refine(
    (values) =>
      values.is_commercial_content ||
      (!values.is_branded_content && !values.is_your_brand),
    {
      path: ["is_commercial_content"],
      message:
        "Tick the commercial-content disclosure before declaring branded content or your own brand.",
    },
  )
  .refine(
    (values) =>
      !values.is_branded_content || values.privacy_level !== "SELF_ONLY",
    {
      path: ["privacy_level"],
      message:
        "TikTok does not allow branded content to be posted privately. Choose a wider audience or remove the declaration.",
    },
  );

export type TikTokMetadataValues = z.infer<typeof tiktokMetadataObject>;
export type TikTokFieldErrors = Partial<
  Record<keyof TikTokMetadataValues, string>
>;

export function tiktokValuesFrom(formData: FormData): Record<string, unknown> {
  return {
    delivery_mode: formData.get("delivery_mode"),
    privacy_level: formData.get("privacy_level"),
    disable_comment: formData.get("disable_comment"),
    disable_duet: formData.get("disable_duet"),
    disable_stitch: formData.get("disable_stitch"),
    is_commercial_content: formData.get("is_commercial_content"),
    is_branded_content: formData.get("is_branded_content"),
    is_your_brand: formData.get("is_your_brand"),
  };
}

export type TikTokParseResult =
  | { success: true; data: TikTokMetadataValues }
  | { success: false; fieldErrors: TikTokFieldErrors };

export function parseTikTokMetadataForm(
  values: Record<string, unknown>,
): TikTokParseResult {
  const result = tiktokMetadataSchema.safeParse(values);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: TikTokFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof TikTokMetadataValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
