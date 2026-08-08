/**
 * Video production vocabulary.
 *
 * The single source of truth for the Video Creation Studio: the database check
 * constraints, the Zod schemas and the editor controls are all derived from
 * these arrays.
 *
 * The load-bearing rule lives in `SCENE_TEXT_SOURCES` and
 * `sceneTextSourceFor`: a Scripture scene **references** the verified verse on
 * the content item and never holds text of its own. A verse copied into an
 * editable field would drift from the verified record silently.
 */

export const ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "9:16": "9:16 — Vertical",
  "16:9": "16:9 — Widescreen",
  "1:1": "1:1 — Square",
};

/**
 * The CSS `aspect-ratio` value for each format.
 *
 * Deliberately not pixel dimensions: the preview is a responsive box, and
 * fixing a width here would tie the layout to one output resolution that no
 * renderer has agreed to yet.
 */
export const ASPECT_RATIO_CSS: Record<AspectRatio, string> = {
  "9:16": "9 / 16",
  "16:9": "16 / 9",
  "1:1": "1 / 1",
};

/** Authoring statuses only — approval and publishing do not exist. */
export const VIDEO_PROJECT_STATUSES = [
  "draft",
  "ready_for_review",
  "archived",
] as const;
export type VideoProjectStatus = (typeof VIDEO_PROJECT_STATUSES)[number];

export const VIDEO_PROJECT_STATUS_LABELS: Record<VideoProjectStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  archived: "Archived",
};

/**
 * The layers a Precious Promises video is built from.
 *
 * `declaration` and `prayer` are separate types from `scripture` and from each
 * other, because they are different content types and must stay
 * distinguishable in the data, in the editor and in anything published.
 */
export const SCENE_TYPES = [
  "scripture",
  "explanation",
  "declaration",
  "prayer",
  "branding",
  "outro",
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

export const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  scripture: "Scripture",
  explanation: "Explanation",
  declaration: "Declaration",
  prayer: "Prayer",
  branding: "Logo / Branding",
  outro: "Outro",
};

export const SCENE_TYPE_HINTS: Record<SceneType, string> = {
  scripture:
    "Reads the verified verse from the content item. It cannot be edited here.",
  explanation: "Your teaching or encouragement in your own words.",
  declaration:
    "A declaration in your own words. This is not Scripture and is never presented as Scripture.",
  prayer:
    "A prayer in your own words. This is not Scripture and is never presented as Scripture.",
  branding: "The Precious Promises mark. Usually no words at all.",
  outro: "How the piece closes.",
};

/** Where a scene's words come from. */
export const SCENE_TEXT_SOURCES = [
  "content_scripture",
  "script_revision",
  "custom",
] as const;
export type SceneTextSource = (typeof SCENE_TEXT_SOURCES)[number];

export const SCENE_TEXT_SOURCE_LABELS: Record<SceneTextSource, string> = {
  content_scripture: "Verified Scripture (referenced)",
  script_revision: "Latest script revision (referenced)",
  custom: "Written here",
};

export const TRANSITIONS = ["none", "fade", "dissolve", "slide"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export const TRANSITION_LABELS: Record<Transition, string> = {
  none: "Cut",
  fade: "Fade",
  dissolve: "Dissolve",
  slide: "Slide",
};

export const TEXT_POSITIONS = ["top", "centre", "bottom"] as const;
export type TextPosition = (typeof TEXT_POSITIONS)[number];

export const TEXT_ALIGNMENTS = ["left", "centre", "right"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];

export const TEXT_ANIMATIONS = ["none", "fade_in", "rise", "scale_in"] as const;
export type TextAnimation = (typeof TEXT_ANIMATIONS)[number];

export const TEXT_ANIMATION_LABELS: Record<TextAnimation, string> = {
  none: "None",
  fade_in: "Fade in",
  rise: "Rise",
  scale_in: "Scale in",
};

export const TEXT_POSITION_LABELS: Record<TextPosition, string> = {
  top: "Top",
  centre: "Centre",
  bottom: "Bottom",
};

export const TEXT_ALIGNMENT_LABELS: Record<TextAlignment, string> = {
  left: "Left",
  centre: "Centre",
  right: "Right",
};

/** The project-level media slots. One asset each. */
export const PRODUCTION_ASSET_ROLES = [
  "background_video",
  "background_image",
  "background_audio",
  "voiceover",
  "logo",
  "caption_track",
] as const;
export type ProductionAssetRole = (typeof PRODUCTION_ASSET_ROLES)[number];

export const PRODUCTION_ASSET_ROLE_LABELS: Record<ProductionAssetRole, string> =
  {
    background_video: "Background video",
    background_image: "Background image",
    background_audio: "Background audio",
    voiceover: "Voiceover",
    logo: "Logo",
    caption_track: "Captions / subtitles",
  };

/**
 * What each slot is for, including what is *not* built.
 *
 * The voiceover and caption slots hold a file the owner supplies. No speech
 * synthesis and no transcription exist — the slots are storage, not a feature
 * that produces audio or captions.
 */
export const PRODUCTION_ASSET_ROLE_HINTS: Record<ProductionAssetRole, string> =
  {
    background_video: "Footage behind the text for the whole piece.",
    background_image: "A still image behind the text for the whole piece.",
    background_audio: "Music or ambience under the piece.",
    voiceover:
      "A narration file you supply. Nothing here generates speech from text.",
    logo: "The mark used by branding scenes.",
    caption_track:
      "A subtitle file you supply. Nothing here transcribes audio.",
  };

export interface VideoProject {
  id: string;
  owner_id: string;
  content_item_id: string;
  name: string;
  aspect_ratio: AspectRatio;
  duration_estimate_seconds: number;
  status: VideoProjectStatus;
  current_revision: number;
  created_at: string;
  updated_at: string;
}

export interface VideoScene {
  id: string;
  owner_id: string;
  project_id: string;
  scene_order: number;
  scene_type: SceneType;
  text_source: SceneTextSource;
  text_content: string | null;
  media_asset_id: string | null;
  duration_seconds: number;
  transition: Transition;
  text_position: TextPosition;
  text_align: TextAlignment;
  text_animation: TextAnimation;
  created_at: string;
  updated_at: string;
}

export interface ProductionAsset {
  id: string;
  owner_id: string;
  project_id: string;
  media_asset_id: string;
  role: ProductionAssetRole;
  starts_at_seconds: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** True when the scene shows the verified verse rather than written prose. */
export function isScriptureScene(scene: { scene_type: SceneType }): boolean {
  return scene.scene_type === "scripture";
}

/**
 * The only legal text source for a scene type.
 *
 * A Scripture scene is forced to `content_scripture`; nothing else may use it.
 * The database enforces the same pairing with two check constraints — both
 * layers, because a verse presented from the wrong source is invisible in a
 * screenshot and permanent once published.
 */
export function sceneTextSourceFor(
  sceneType: SceneType,
  requested: SceneTextSource,
): SceneTextSource {
  if (sceneType === "scripture") {
    return "content_scripture";
  }
  return requested === "content_scripture" ? "custom" : requested;
}

/** Which script section a scene type reads when its source is a revision. */
export const SCENE_SCRIPT_SECTION: Partial<
  Record<SceneType, "hook" | "explanation" | "declaration" | "prayer" | "outro">
> = {
  explanation: "explanation",
  declaration: "declaration",
  prayer: "prayer",
  outro: "outro",
};
