"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SceneFrame } from "./scene-frame";
import type { PreviewScene } from "@/lib/video/preview";
import { formatDuration } from "@/lib/video/scenes";
import type { AspectRatio } from "@/lib/video/types";

/**
 * Live browser preview.
 *
 * Plays the composition by advancing through scenes on their own durations.
 * It is a genuine preview of the layout and timing — and it is **not a
 * render**: no file is produced, no encoder runs, and the audio slots are not
 * played. The label says so, because a moving preview is exactly the thing
 * someone would mistake for a finished video.
 *
 * The selected scene is a URL parameter elsewhere in the editor, so this
 * component owns only playback state.
 */
export function PreviewPlayer({
  scenes,
  aspectRatio,
  backgroundSceneIds,
  initialIndex = 0,
}: {
  scenes: PreviewScene[];
  aspectRatio: AspectRatio;
  /** Scene ids that have a background asset attached. */
  backgroundSceneIds: string[];
  initialIndex?: number;
}) {
  const [index, setIndex] = useState(
    Math.min(Math.max(initialIndex, 0), Math.max(scenes.length - 1, 0)),
  );
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playing || scenes.length === 0) {
      return;
    }

    const current = scenes[index];
    if (!current) {
      return;
    }

    timer.current = setTimeout(
      () => {
        setIndex((previous) => {
          const next = previous + 1;
          if (next >= scenes.length) {
            setPlaying(false);
            return previous;
          }
          return next;
        });
      },
      Math.max(current.scene.duration_seconds, 0.5) * 1000,
    );

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [playing, index, scenes]);

  if (scenes.length === 0) {
    return (
      <p className="rounded-xl border border-edge bg-panel-raised/40 px-4 py-10 text-center text-sm text-ink-secondary">
        Add a scene to see the preview.
      </p>
    );
  }

  const current = scenes[Math.min(index, scenes.length - 1)]!;
  const total = scenes.reduce(
    (sum, item) => sum + item.scene.duration_seconds,
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <SceneFrame
        preview={current}
        aspectRatio={aspectRatio}
        hasBackground={backgroundSceneIds.includes(current.scene.id)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          {playing ? (
            <Pause aria-hidden="true" className="size-4" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
          {playing ? "Pause preview" : "Play preview"}
        </button>

        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setIndex(0);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-edge px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Restart
        </button>

        <p aria-live="polite" className="text-xs text-ink-muted">
          Scene {current.scene.scene_order} of {scenes.length} ·{" "}
          {formatDuration(total)} total
        </p>
      </div>

      <p className="text-xs text-ink-muted">
        Layout and timing preview only. Nothing is rendered, encoded or played
        back as audio.
      </p>
    </div>
  );
}
