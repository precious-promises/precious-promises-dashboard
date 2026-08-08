import { z } from "zod";

import { MAX_SCENE_SECONDS, MIN_SCENE_SECONDS } from "./scenes";
import {
  ASPECT_RATIOS,
  PRODUCTION_ASSET_ROLES,
  SCENE_TEXT_SOURCES,
  SCENE_TYPES,
  TEXT_ALIGNMENTS,
  TEXT_ANIMATIONS,
  TEXT_POSITIONS,
  TRANSITIONS,
  VIDEO_PROJECT_STATUSES,
} from "./types";

/**
 * Video studio validation.
 *
 * No `owner_id` and no `project_id` anywhere: ownership comes from the session
 * and the parent comes from the route, so neither can be smuggled in through a
 * form. A submitted `owner_id` is stripped before it reaches the database.
 *
 * No Scripture fields either. A Scripture scene references the verified verse
 * on the content item, and `sceneObjectSchema` refuses text on one outright.
 */

/**
 * An optional text field.
 *
 * `FormData.get` returns `null` for a field the form did not include, and an
 * empty string for one left blank. Both mean "not supplied" here, so both
 * become `undefined` before validation — otherwise a form that simply omits an
 * optional field fails on it.
 */
const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      value === null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    z.string().trim().max(max).optional(),
  );

/** Form numbers arrive as strings; empty means "not supplied". */
const numberFromForm = z.preprocess((value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : Number(trimmed);
  }
  return value === null ? undefined : value;
}, z.number());

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectFormSchema = z.object({
  name: z
    .string({ error: "Give this project a name" })
    .trim()
    .min(1, "Give this project a name")
    .max(200, "Keep the name under 200 characters"),
  content_item_id: z
    .string({ error: "Choose a content item" })
    .trim()
    .min(1, "Choose a content item"),
  aspect_ratio: z.enum(ASPECT_RATIOS, { error: "Choose an aspect ratio" }),
  status: z.enum(VIDEO_PROJECT_STATUSES).default("draft"),
});

export type ProjectFormValues = z.output<typeof projectFormSchema>;
export type ProjectFieldErrors = Partial<
  Record<keyof ProjectFormValues, string>
>;

// ---------------------------------------------------------------------------
// Scenes
// ---------------------------------------------------------------------------

/**
 * The scene field shape, exported separately.
 *
 * `sceneFormSchema` wraps this in `.superRefine()`, which hides `.shape`
 * behind Zod internals. Tests assert on the field list, so the object is named
 * here rather than reached for through `_def`.
 */
export const sceneObjectSchema = z.object({
  scene_type: z.enum(SCENE_TYPES, { error: "Choose a scene type" }),
  text_source: z.enum(SCENE_TEXT_SOURCES).default("custom"),
  text_content: optionalText(5000),
  media_asset_id: optionalText(100),
  duration_seconds: numberFromForm
    .refine(
      (value) => value >= MIN_SCENE_SECONDS,
      `A scene must last at least ${MIN_SCENE_SECONDS} seconds`,
    )
    .refine(
      (value) => value <= MAX_SCENE_SECONDS,
      `A scene cannot last more than ${MAX_SCENE_SECONDS} seconds`,
    ),
  transition: z.enum(TRANSITIONS).default("none"),
  text_position: z.enum(TEXT_POSITIONS).default("centre"),
  text_align: z.enum(TEXT_ALIGNMENTS).default("centre"),
  text_animation: z.enum(TEXT_ANIMATIONS).default("none"),
});

/**
 * The Scripture rules, enforced at the edge of the application.
 *
 * Both are also check constraints on `video_scenes`. Two layers, because a
 * verse rewritten through a scene field would be invisible in review and
 * permanent once published.
 */
export const sceneFormSchema = sceneObjectSchema.superRefine((values, ctx) => {
  if (values.scene_type === "scripture") {
    if (values.text_content !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["text_content"],
        message:
          "Scripture is read from the content item and cannot be written here.",
      });
    }
    if (values.text_source !== "content_scripture") {
      ctx.addIssue({
        code: "custom",
        path: ["text_source"],
        message: "A Scripture scene must reference the verified verse.",
      });
    }
    return;
  }

  if (values.text_source === "content_scripture") {
    ctx.addIssue({
      code: "custom",
      path: ["text_source"],
      message: "Only a Scripture scene may show the verified verse.",
    });
  }

  if (
    values.text_source === "script_revision" &&
    values.text_content !== undefined
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["text_content"],
      message:
        "This scene reads the saved script. Switch to “Written here” to type your own words.",
    });
  }
});

export type SceneFormValues = z.output<typeof sceneFormSchema>;
export type SceneFieldErrors = Partial<Record<keyof SceneFormValues, string>>;

// ---------------------------------------------------------------------------
// Production asset slots
// ---------------------------------------------------------------------------

export const productionAssetFormSchema = z.object({
  role: z.enum(PRODUCTION_ASSET_ROLES, { error: "Choose a slot" }),
  media_asset_id: z
    .string({ error: "Choose a media asset" })
    .trim()
    .min(1, "Choose a media asset"),
  starts_at_seconds: numberFromForm
    .refine((value) => value >= 0, "A start time cannot be negative")
    .default(0),
  notes: optionalText(2000),
});

export type ProductionAssetFormValues = z.output<
  typeof productionAssetFormSchema
>;
export type ProductionAssetFieldErrors = Partial<
  Record<keyof ProductionAssetFormValues, string>
>;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

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

export function parseProjectForm(
  input: unknown,
): ParseResult<ProjectFormValues> {
  return collect(projectFormSchema.safeParse(input));
}

export function parseSceneForm(input: unknown): ParseResult<SceneFormValues> {
  return collect(sceneFormSchema.safeParse(input));
}

export function parseProductionAssetForm(
  input: unknown,
): ParseResult<ProductionAssetFormValues> {
  return collect(productionAssetFormSchema.safeParse(input));
}

// ---------------------------------------------------------------------------
// FormData readers
// ---------------------------------------------------------------------------

export function projectValuesFrom(formData: FormData): unknown {
  return {
    name: formData.get("name"),
    content_item_id: formData.get("content_item_id"),
    aspect_ratio: formData.get("aspect_ratio"),
    status: formData.get("status") ?? "draft",
  };
}

export function sceneValuesFrom(formData: FormData): unknown {
  return {
    scene_type: formData.get("scene_type"),
    text_source: formData.get("text_source") ?? "custom",
    text_content: formData.get("text_content"),
    media_asset_id: formData.get("media_asset_id"),
    duration_seconds: formData.get("duration_seconds"),
    transition: formData.get("transition") ?? "none",
    text_position: formData.get("text_position") ?? "centre",
    text_align: formData.get("text_align") ?? "centre",
    text_animation: formData.get("text_animation") ?? "none",
  };
}

export function productionAssetValuesFrom(formData: FormData): unknown {
  return {
    role: formData.get("role"),
    media_asset_id: formData.get("media_asset_id"),
    starts_at_seconds: formData.get("starts_at_seconds") ?? 0,
    notes: formData.get("notes"),
  };
}
