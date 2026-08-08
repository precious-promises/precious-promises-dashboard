import { BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PreviewScene } from "@/lib/video/preview";
import {
  ASPECT_RATIO_CSS,
  SCENE_TYPE_LABELS,
  type AspectRatio,
} from "@/lib/video/types";

/**
 * One frame of the composition, drawn in the browser.
 *
 * This is a **layout preview**, not a render. It shows where text sits, how it
 * is aligned and which preset it animates with. It produces no file, and the
 * page says so beside it.
 *
 * Scripture and prose are drawn by two different branches, from two different
 * shapes in the preview union. A declaration cannot reach the Scripture branch
 * because it never carries a reference or a translation — the distinction is
 * in the data, not in a conditional someone has to maintain.
 */

const POSITION_CLASSES = {
  top: "justify-start",
  centre: "justify-center",
  bottom: "justify-end",
} as const;

const ALIGN_CLASSES = {
  left: "text-left items-start",
  centre: "text-center items-center",
  right: "text-right items-end",
} as const;

const ANIMATION_CLASSES = {
  none: "",
  fade_in: "pp-anim-fade_in",
  rise: "pp-anim-rise",
  scale_in: "pp-anim-scale_in",
} as const;

export function SceneFrame({
  preview,
  aspectRatio,
  hasBackground,
}: {
  preview: PreviewScene;
  aspectRatio: AspectRatio;
  /** Whether a media asset is attached, so the empty ground can say so. */
  hasBackground: boolean;
}) {
  const { scene, body, unavailable } = preview;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-edge bg-ink",
        !hasBackground && "pp-canvas-empty",
      )}
      style={{ aspectRatio: ASPECT_RATIO_CSS[aspectRatio] }}
      data-scene-type={scene.scene_type}
      data-testid="scene-frame"
    >
      {hasBackground ? (
        <div className="absolute inset-0 flex items-center justify-center bg-panel/80">
          <span className="text-xs text-ink-muted">
            Background asset attached — the file itself is not loaded here.
          </span>
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex h-full flex-col p-[6%]",
          POSITION_CLASSES[scene.text_position],
        )}
      >
        <div
          key={`${scene.id}-${scene.text_animation}`}
          className={cn(
            "flex w-full flex-col gap-2",
            ALIGN_CLASSES[scene.text_align],
            ANIMATION_CLASSES[scene.text_animation],
          )}
        >
          {body.kind === "scripture" ? (
            <figure className="w-full">
              <blockquote className="text-sm leading-snug font-medium text-ink-primary sm:text-base lg:text-lg">
                {body.text ?? "—"}
              </blockquote>
              <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gold">
                <BookOpen aria-hidden="true" className="size-3.5" />
                {body.reference ?? "Reference not recorded"}
                <span className="text-ink-muted">{body.translation}</span>
              </figcaption>
            </figure>
          ) : (
            <>
              <span className="text-[11px] tracking-wide text-ink-muted uppercase">
                {SCENE_TYPE_LABELS[body.sceneType]}
                {body.referenced ? " · from the script" : ""}
              </span>
              <p className="text-sm leading-snug whitespace-pre-line text-ink-primary sm:text-base">
                {body.text ?? ""}
              </p>
            </>
          )}
        </div>
      </div>

      {unavailable ? (
        <p className="absolute inset-x-3 bottom-3 rounded-md border border-edge-strong/70 bg-panel/90 px-3 py-2 text-center text-xs text-ink-secondary">
          {unavailable}
        </p>
      ) : null}
    </div>
  );
}
