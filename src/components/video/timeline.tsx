import { AudioLines, Captions, Mic } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  formatDuration,
  sceneStartTimes,
  totalDuration,
} from "@/lib/video/scenes";
import {
  PRODUCTION_ASSET_ROLE_LABELS,
  SCENE_TYPE_LABELS,
  type ProductionAsset,
  type VideoScene,
} from "@/lib/video/types";

/**
 * The timeline: scenes in order, then the audio and caption lanes.
 *
 * Scene widths are proportional to duration, so a five-second scene next to a
 * one-second scene looks like what it is. A minimum width keeps very short
 * scenes clickable.
 *
 * The lanes are shown whether or not a slot is filled. An empty lane that says
 * "empty" is information; a lane that disappears when unused hides the fact
 * that the slot exists at all.
 */

const SCENE_TONES: Record<VideoScene["scene_type"], string> = {
  scripture: "border-gold-dim/60 bg-gold/10",
  explanation: "border-edge-strong bg-panel-raised/70",
  declaration: "border-highlight-dim/70 bg-highlight/10",
  prayer: "border-highlight-dim/50 bg-panel-raised/70",
  branding: "border-edge-strong bg-panel-hover/60",
  outro: "border-edge-strong bg-panel-raised/50",
};

const LANE_ICONS = {
  background_audio: AudioLines,
  voiceover: Mic,
  caption_track: Captions,
} as const;

export function Timeline({
  projectId,
  scenes,
  assets,
  selectedSceneId,
}: {
  projectId: string;
  scenes: VideoScene[];
  assets: ProductionAsset[];
  selectedSceneId: string | null;
}) {
  const total = totalDuration(scenes);
  const positioned = sceneStartTimes(scenes);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        {scenes.length} {scenes.length === 1 ? "scene" : "scenes"} ·{" "}
        {formatDuration(total)} estimated
      </p>

      {scenes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-edge-strong px-4 py-6 text-center text-sm text-ink-muted">
          No scenes yet. Add one from the layers panel.
        </p>
      ) : (
        <ol className="flex w-full gap-1.5 overflow-x-auto pb-1">
          {positioned.map(({ scene, startsAt }) => {
            const share = total > 0 ? scene.duration_seconds / total : 0;
            const isSelected = scene.id === selectedSceneId;

            return (
              <li
                key={scene.id}
                className="min-w-24 shrink-0"
                style={{ flexGrow: Math.max(share * 100, 1) }}
              >
                <Link
                  href={`/dashboard/video/${projectId}?scene=${scene.id}`}
                  aria-current={isSelected ? "true" : undefined}
                  className={cn(
                    "flex h-full flex-col gap-1 rounded-lg border px-2.5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight",
                    SCENE_TONES[scene.scene_type],
                    isSelected
                      ? "ring-2 ring-highlight"
                      : "hover:border-edge-strong",
                  )}
                >
                  <span className="text-[11px] font-medium text-ink-primary">
                    {scene.scene_order}. {SCENE_TYPE_LABELS[scene.scene_type]}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {scene.duration_seconds}s · from {formatDuration(startsAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-col gap-1.5">
        {(["background_audio", "voiceover", "caption_track"] as const).map(
          (role) => {
            const Icon = LANE_ICONS[role];
            const filled = assets.find((asset) => asset.role === role);

            return (
              <div
                key={role}
                className="flex items-center gap-3 rounded-lg border border-edge/70 bg-panel-raised/30 px-3 py-2"
              >
                <Icon aria-hidden="true" className="size-4 text-ink-muted" />
                <span className="text-xs font-medium text-ink-secondary">
                  {PRODUCTION_ASSET_ROLE_LABELS[role]}
                </span>
                <span className="ml-auto text-xs text-ink-muted">
                  {filled
                    ? `Attached · starts at ${formatDuration(filled.starts_at_seconds)}`
                    : "Empty"}
                </span>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}
