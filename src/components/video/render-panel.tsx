import { Film } from "lucide-react";

import { requestProjectRender } from "@/app/dashboard/video/actions";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  describeRenderCapability,
  RENDER_STATUS_LABELS,
  type RenderJob,
  type RenderStatus,
} from "@/lib/video/render";

/**
 * Render status.
 *
 * **No rendering provider is connected**, and this panel says so in words
 * before offering the button. Pressing it records a *failed* render job with
 * the reason — deliberately not a queued one, because a queue nobody consumes
 * looks like work in progress.
 *
 * Every request is listed, including the refusals. The history of what was
 * asked for is how the system stays trustworthy about what it did and did not
 * produce.
 */

const STATUS_TONES: Record<RenderStatus, StatusTone> = {
  queued: "inactive",
  rendering: "inactive",
  completed: "configured",
  failed: "accent",
  cancelled: "inactive",
};

export function RenderPanel({
  projectId,
  jobs,
}: {
  projectId: string;
  jobs: RenderJob[];
}) {
  const capability = describeRenderCapability();

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-ink-primary">
            <Film aria-hidden="true" className="size-4 text-ink-muted" />
            Server rendering
          </span>
          <StatusBadge tone={capability.connected ? "configured" : "inactive"}>
            {capability.connected ? "Connected" : "Not connected"}
          </StatusBadge>
        </div>
        <p className="text-xs text-ink-muted">{capability.detail}</p>
      </div>

      <form action={requestProjectRender}>
        <input type="hidden" name="project_id" value={projectId} />
        <button
          type="submit"
          className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Request a render
        </button>
        <p className="mt-1.5 text-xs text-ink-muted">
          This will be recorded as a failed request until a renderer exists. It
          produces no file.
        </p>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-primary">
          Render history
        </h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-ink-muted">No renders requested yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-ink-secondary">
                    Revision {job.project_revision}
                  </span>
                  <StatusBadge tone={STATUS_TONES[job.status]}>
                    {RENDER_STATUS_LABELS[job.status]}
                  </StatusBadge>
                </div>
                {job.failure_reason ? (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {job.failure_reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
