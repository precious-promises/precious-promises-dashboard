/**
 * The render input contract.
 *
 * Everything the composition receives is plain serialisable data, resolved
 * server-side before the render starts: Scripture text comes from the
 * verified content record, script text from the referenced revision, and
 * media from short-lived signed URLs. The composition itself resolves
 * nothing and can invent nothing.
 */

export const RENDER_FPS = 30;

export interface RenderDimensions {
  width: number;
  height: number;
}

/** Explicit project settings, never inferred from content. */
export const ASPECT_DIMENSIONS: Record<string, RenderDimensions> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

/**
 * A scene's text, typed by provenance.
 *
 * Scripture arrives as a distinct shape carrying its reference and
 * translation, and the composition renders it in a visibly different
 * treatment. The two can never blur because they never share a field.
 */
export type RenderSceneBody =
  | {
      kind: "scripture";
      text: string;
      reference: string;
      translation: string;
    }
  | { kind: "prose"; text: string }
  | { kind: "none" };

// Type aliases rather than interfaces, deliberately: Remotion's Composition
// generic requires props assignable to Record<string, unknown>, which aliases
// satisfy structurally and interfaces do not.
export type RenderScene = {
  id: string;
  sceneType: string;
  durationSeconds: number;
  transition: "none" | "fade" | "dissolve" | "slide";
  textPosition: "top" | "centre" | "bottom";
  textAlign: "left" | "centre" | "right";
  textAnimation: "none" | "fade_in" | "rise" | "scale_in";
  body: RenderSceneBody;
  /** A short-lived signed URL, or null for the brand background. */
  backgroundUrl: string | null;
  backgroundKind: "video" | "image" | null;
};

export type RenderVideoProps = {
  title: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  scenes: RenderScene[];
  brandLine: string | null;
  /** Voiceover audio as a short-lived signed URL, or null. */
  voiceoverUrl: string | null;
};

export function totalDurationInFrames(scenes: readonly RenderScene[]): number {
  const seconds = scenes.reduce(
    (sum, scene) => sum + Math.max(scene.durationSeconds, 0.5),
    0,
  );
  return Math.max(Math.round(seconds * RENDER_FPS), RENDER_FPS);
}

export const RENDER_COMPOSITION_ID = "PreciousPromisesVideo";

export const DEFAULT_RENDER_PROPS: RenderVideoProps = {
  title: "Untitled",
  aspectRatio: "9:16",
  scenes: [],
  brandLine: null,
  voiceoverUrl: null,
};
