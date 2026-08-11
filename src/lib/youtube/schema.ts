import { z } from "zod";

import { PRIVACY_STATUSES, REQUESTABLE_PRIVACY_STATUSES } from "./config";

/**
 * The YouTube settings form.
 *
 * Parsed on the server from `FormData`, never trusted from the client. Two
 * rules shape the schema:
 *
 * 1. **`made_for_kids` has no default.** It is a legal declaration under
 *    COPPA, and a default would be this system answering it on Dave's behalf.
 *    The form offers three states — yes, no, and unanswered — and an upload is
 *    refused while it is unanswered.
 * 2. **`public` is not selectable.** Google forces uploads from an unaudited
 *    API client to private regardless of what is requested, so offering it
 *    would offer something the platform overrides.
 */

/**
 * `FormData.get` returns `null` for a field that was not submitted, and an
 * empty string for one submitted blank. Both mean "not provided" here.
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) {
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
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  );

/**
 * A tri-state answer.
 *
 * `""` — the unanswered option — becomes `null`, which is what the database
 * stores and what `validateForYouTube` refuses to publish on.
 */
const triState = z.preprocess(
  (value) => (value === null ? "" : value),
  z
    .enum(["", "yes", "no"])
    .transform((value) => (value === "" ? null : value === "yes")),
);

const checkbox = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);

/**
 * Tags, split on commas.
 *
 * The combined-length rule YouTube applies is checked in
 * `validateForYouTube`, alongside every other publishing rule, so all of them
 * are reported together rather than one per save.
 */
const tagList = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string().transform((value) =>
    value
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag !== "")
      .slice(0, 100),
  ),
);

export const youtubeMetadataSchema = z.object({
  category_id: optionalText(10),
  default_language: optionalText(20),
  default_audio_language: optionalText(20),
  tags: tagList,
  privacy_status: z
    .enum(PRIVACY_STATUSES)
    .refine(
      (value) => REQUESTABLE_PRIVACY_STATUSES.includes(value),
      "This API client cannot request that privacy status.",
    ),
  self_declared_made_for_kids: triState,
  contains_synthetic_media: checkbox,
  notify_subscribers: checkbox,
  playlist_id: optionalText(100),
  thumbnail_media_asset_id: optionalText(100),
});

export type YouTubeMetadataValues = z.infer<typeof youtubeMetadataSchema>;
export type YouTubeFieldErrors = Partial<
  Record<keyof YouTubeMetadataValues, string>
>;

/** Pull the form's fields out of a `FormData` in one place. */
export function youtubeValuesFrom(formData: FormData): Record<string, unknown> {
  return {
    category_id: formData.get("category_id"),
    default_language: formData.get("default_language"),
    default_audio_language: formData.get("default_audio_language"),
    tags: formData.get("tags"),
    privacy_status: formData.get("privacy_status"),
    self_declared_made_for_kids: formData.get("self_declared_made_for_kids"),
    contains_synthetic_media: formData.get("contains_synthetic_media"),
    notify_subscribers: formData.get("notify_subscribers"),
    playlist_id: formData.get("playlist_id"),
    thumbnail_media_asset_id: formData.get("thumbnail_media_asset_id"),
  };
}

export type YouTubeParseResult =
  | { success: true; data: YouTubeMetadataValues }
  | { success: false; fieldErrors: YouTubeFieldErrors };

export function parseYouTubeMetadataForm(
  values: Record<string, unknown>,
): YouTubeParseResult {
  const result = youtubeMetadataSchema.safeParse(values);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: YouTubeFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      fieldErrors[field as keyof YouTubeMetadataValues] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
