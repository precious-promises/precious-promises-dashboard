import { Film } from "lucide-react";

import {
  cancelRender,
  processRenderQueueNow,
  reconcileRender,
  requestProjectRender,
} from "@/app/dashboard/video/actions";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { isRenderConfigured } from "@/lib/render/server-config";
import {
  RENDER_STATUS_LABELS,
  type RenderJob,
  type RenderStatus,
} from "@/lib/video/render";

/**
 * Render status and controls.
 *
 * The renderer is **implemented** — Remotion server-side rendering in the
 * background worker path — and this panel says plainly whether it is enabled
 * in this runtime. A request while disabled records a *failed* job with the
 * reason, never a queued one nothing will consume.
 *
 * Every request is listed, including refusals and cancellations. The history
 * of what was asked for is how the system stays trustworthy about what it did
 * and did not produce.
 */

const STATUS_TONES: Record<RenderStatus, StatusTone> = {
  queued: "inactive",
  rendering: "inactive",
  completed: "configured",
  failed: "accent",
  cancelled: "inactive",
};

const SMALL_BUTTON =
  "rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight";

export function RenderPanel({
  projectId,
  jobs,
}: {
  projectId: string;
  jobs: RenderJob[];
}) {
  const enabled = isRenderConfigured();
  const hasQueued = jobs.some((job) => job.status === "queued");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-ink-primary">
            <Film aria-hidden="true" className="size-4 text-ink-muted" />
            Server rendering
          </span>
          <StatusBadge tone={enabled ? "configured" : "inactive"}>
            {enabled ? "Enabled" : "Not enabled"}
          </StatusBadge>
        </div>
        <p className="text-xs text-ink-muted">
          {enabled
            ? "Remotion rendering is enabled for this runtime. Queued renders run in the background worker path and their files land in private storage — nothing is marked completed unless the file genuinely exists."
            : "Remotion rendering is implemented but not enabled here. It needs RENDER_ENABLED=true on a runtime with headless Chromium and FFmpeg, plus the trusted worker credential. Until then a request records a failed job, honestly."}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <form action={requestProjectRender}>
          <input type="hidden" name="project_id" value={projectId} />
          <button
            type="submit"
            className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            Request a render
          </button>
        </form>

        {enabled && hasQueued ? (
          <form action={processRenderQueueNow}>
            <input type="hidden" name="project_id" value={projectId} />
            <button type="submit" className={SMALL_BUTTON}>
              Process queue now
            </button>
          </form>
        ) : null}
      </div>
      <p className="-mt-2 text-xs text-ink-muted">
        {enabled
          ? "Requesting queues the current revision. Process the queue here, or leave it to the background sweep when one is deployed."
          : "This will be recorded as a failed request while rendering is disabled. It produces no file."}
      </p>

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
                {job.status === "queued" || job.status === "rendering" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {job.status === "rendering" ? (
                      <form action={reconcileRender}>
                        <input
                          type="hidden"
                          name="project_id"
                          value={projectId}
                        />
                        <input type="hidden" name="job_id" value={job.id} />
                        <button type="submit" className={SMALL_BUTTON}>
                          Reconcile
                        </button>
                      </form>
                    ) : null}
                    <form action={cancelRender}>
                      <input
                        type="hidden"
                        name="project_id"
                        value={projectId}
                      />
                      <input type="hidden" name="job_id" value={job.id} />
                      <button type="submit" className={SMALL_BUTTON}>
                        Cancel
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
