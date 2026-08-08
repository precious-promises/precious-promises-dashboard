import type { ContentItem } from "@/lib/content/types";
import type { ScriptRevision } from "@/lib/scripts/types";

import { sceneStartTimes } from "./scenes";
import { SCENE_SCRIPT_SECTION, type VideoScene } from "./types";

/**
 * Resolving a scene into something previewable.
 *
 * The output is a **discriminated union**, and that is the point. A preview
 * frame is either `scripture` — carrying a reference, a translation and a
 * verification status — or `prose`, carrying the owner's own words and the
 * scene type they came from. There is no shape that holds prose while
 * claiming to be Scripture, so the renderer cannot mistake one for the other.
 *
 * Nothing here generates, completes or rewrites text. Every value is read from
 * a stored record.
 */

export interface ScripturePreviewBody {
  kind: "scripture";
  reference: string | null;
  text: string | null;
  translation: string;
  verificationStatus: ContentItem["scripture_verification_status"];
}

export interface ProsePreviewBody {
  kind: "prose";
  sceneType: Exclude<VideoScene["scene_type"], "scripture">;
  text: string | null;
  /** True when the words came from the saved script rather than this scene. */
  referenced: boolean;
}

export type PreviewBody = ScripturePreviewBody | ProsePreviewBody;

export interface PreviewScene {
  scene: VideoScene;
  startsAt: number;
  body: PreviewBody;
  /** Set when the scene cannot show anything yet, and why. */
  unavailable: string | null;
}

function scriptureBody(item: ContentItem | null): ScripturePreviewBody {
  return {
    kind: "scripture",
    reference: item?.scripture_reference ?? null,
    text: item?.scripture_text ?? null,
    translation: item?.scripture_translation ?? "",
    verificationStatus: item?.scripture_verification_status ?? "unverified",
  };
}

/**
 * Resolve one scene.
 *
 * A Scripture scene reads the content item every time; it never carries a
 * copy. If the item has no verse recorded, the scene reports that plainly
 * rather than falling back to any other text.
 */
export function resolveScene(
  scene: VideoScene,
  item: ContentItem | null,
  script: ScriptRevision | null,
): { body: PreviewBody; unavailable: string | null } {
  if (scene.scene_type === "scripture") {
    const body = scriptureBody(item);
    return {
      body,
      unavailable:
        body.reference === null && body.text === null
          ? "No Scripture recorded on this content item yet."
          : null,
    };
  }

  const sceneType = scene.scene_type;

  if (scene.text_source === "script_revision") {
    const section = SCENE_SCRIPT_SECTION[sceneType];
    const text = section && script ? (script[section] ?? null) : null;
    return {
      body: { kind: "prose", sceneType, text, referenced: true },
      unavailable:
        text === null || text.trim() === ""
          ? "This scene reads the saved script, which has nothing written for it yet."
          : null,
    };
  }

  const text = scene.text_content;
  return {
    body: { kind: "prose", sceneType, text, referenced: false },
    unavailable:
      text === null || text.trim() === "" ? "No words written yet." : null,
  };
}

/** The whole composition, in order, with start times. */
export function buildPreview(
  scenes: VideoScene[],
  item: ContentItem | null,
  script: ScriptRevision | null,
): PreviewScene[] {
  return sceneStartTimes(scenes).map(({ scene, startsAt }) => {
    const { body, unavailable } = resolveScene(scene, item, script);
    return { scene, startsAt, body, unavailable };
  });
}
