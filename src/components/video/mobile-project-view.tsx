import { MonitorSmartphone } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/ui/status-badge";
import { formatDuration, sceneStartTimes } from "@/lib/video/scenes";
import {
  ASPECT_RATIO_LABELS,
  PRODUCTION_ASSET_ROLE_LABELS,
  SCENE_TEXT_SOURCE_LABELS,
  SCENE_TYPE_LABELS,
  VIDEO_PROJECT_STATUS_LABELS,
  type ProductionAsset,
  type VideoProject,
  type VideoScene,
} from "@/lib/video/types";

/**
 * The mobile view of a project.
 *
 * Deliberately **not** the editor. A four-region editor with a timeline and a
 * preview canvas cannot be operated with a thumb, and shrinking it would
 * produce something that looks usable and is not. This is a management view:
 * read the composition, see what is attached, and know where to finish the
 * work.
 *
 * It renders on the server alongside the editor and is swapped by CSS, so both
 * are always present in the markup and neither depends on JavaScript.
 */
export function MobileProjectView({
  project,
  scenes,
  assets,
}: {
  project: VideoProject;
  scenes: VideoScene[];
  assets: ProductionAsset[];
}) {
  const positioned = sceneStartTimes(scenes);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-edge bg-panel-raised/40 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium text-ink-primary">
          <MonitorSmartphone aria-hidden="true" className="size-4" />
          Management view
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          The full editor needs a wider screen. Everything below is live; open
          this project on a laptop or desktop to change the composition.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">Format</dt>
          <dd className="text-ink-primary">
            {ASPECT_RATIO_LABELS[project.aspect_ratio]}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Status</dt>
          <dd className="text-ink-primary">
            {VIDEO_PROJECT_STATUS_LABELS[project.status]}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Estimated length</dt>
          <dd className="text-ink-primary">
            {formatDuration(project.duration_estimate_seconds)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Revision</dt>
          <dd className="text-ink-primary">{project.current_revision}</dd>
        </div>
      </dl>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-primary">
          Scenes ({scenes.length})
        </h3>
        {scenes.length === 0 ? (
          <p className="text-sm text-ink-muted">No scenes yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {positioned.map(({ scene, startsAt }) => (
              <li
                key={scene.id}
                className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-primary">
                    {scene.scene_order}. {SCENE_TYPE_LABELS[scene.scene_type]}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {scene.duration_seconds}s · from {formatDuration(startsAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {SCENE_TEXT_SOURCE_LABELS[scene.text_source]}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-ink-primary">
          Media slots
        </h3>
        <ul className="flex flex-col gap-2">
          {(
            [
              "background_video",
              "background_audio",
              "voiceover",
              "logo",
            ] as const
          ).map((role) => {
            const filled = assets.some((asset) => asset.role === role);
            return (
              <li
                key={role}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/30 px-3 py-2"
              >
                <span className="text-xs text-ink-secondary">
                  {PRODUCTION_ASSET_ROLE_LABELS[role]}
                </span>
                <StatusBadge tone={filled ? "configured" : "inactive"}>
                  {filled ? "Attached" : "Empty"}
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      </section>

      <Link
        href={`/dashboard/content/${project.content_item_id}`}
        className="text-sm text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        Open the source content item
      </Link>
    </div>
  );
}
