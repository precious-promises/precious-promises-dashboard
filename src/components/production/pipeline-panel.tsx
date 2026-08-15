"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  advanceProductionJob,
  cancelProductionJob,
  createProductionJob,
  type PipelineActionState,
} from "@/app/dashboard/production/pipeline-actions";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  canTransitionProduction,
  PRODUCTION_JOB_STATUS_LABELS,
  PRODUCTION_JOB_STATUSES,
  TERMINAL_PRODUCTION_STATUSES,
  type ProductionJob,
  type ProductionJobStatus,
} from "@/lib/production/pipeline";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const STEP_BUTTON =
  "rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60";

export interface PipelineJobView {
  job: ProductionJob;
  contentTitle: string;
  /** The newest render job on the linked video project, when one exists. */
  latestRender: { id: string; status: string } | null;
}

function statusTone(
  status: ProductionJobStatus,
): "configured" | "accent" | "inactive" {
  if (status === "ready_for_review") return "configured";
  if (status === "failed" || status === "cancelled") return "inactive";
  return "accent";
}

function Messages({ state }: { state: PipelineActionState }) {
  return (
    <>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs leading-5 text-red-200"
        >
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-xs leading-5 text-ink-secondary"
        >
          {state.notice}
        </p>
      ) : null}
    </>
  );
}

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating…" : "Start production job"}
    </button>
  );
}

function AdvanceButtons({ targets }: { targets: ProductionJobStatus[] }) {
  const { pending } = useFormStatus();
  return (
    <>
      {targets.map((target) => (
        <button
          key={target}
          type="submit"
          name="target_status"
          value={target}
          disabled={pending}
          className={STEP_BUTTON}
        >
          {target === "ready_for_review"
            ? "Mark ready for review"
            : target === "pending"
              ? "Retry from the start"
              : `Step: ${PRODUCTION_JOB_STATUS_LABELS[target].toLowerCase()}`}
        </button>
      ))}
    </>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-950/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Cancelling…" : "Cancel job"}
    </button>
  );
}

function JobRow({ view }: { view: PipelineJobView }) {
  const [advanceState, advanceAction] = useActionState(
    advanceProductionJob,
    {} as PipelineActionState,
  );
  const [cancelState, cancelAction] = useActionState(
    cancelProductionJob,
    {} as PipelineActionState,
  );

  const { job } = view;
  const targets = PRODUCTION_JOB_STATUSES.filter(
    (status) =>
      status !== "cancelled" &&
      status !== "failed" &&
      canTransitionProduction(job.status, status),
  );
  const finished = (
    TERMINAL_PRODUCTION_STATUSES as readonly ProductionJobStatus[]
  ).includes(job.status);

  return (
    <li className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-primary">
          {view.contentTitle}
        </span>
        <StatusBadge tone={statusTone(job.status)}>
          {PRODUCTION_JOB_STATUS_LABELS[job.status]}
        </StatusBadge>
      </div>

      {job.status === "failed" ? (
        <p className="mt-1.5 text-xs leading-5 text-red-200">
          Failed at a step
          {job.failure_category ? ` (${job.failure_category})` : ""}
          {job.failure_detail ? `: ${job.failure_detail}` : "."} Later steps
          stay blocked until you retry or cancel.
        </p>
      ) : null}

      {view.latestRender !== null ? (
        <p className="mt-1.5 text-xs leading-5 text-ink-muted">
          Latest render on the linked video project: {view.latestRender.status}.
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-col gap-2">
        <Messages state={advanceState} />
        <Messages state={cancelState} />

        {targets.length > 0 ? (
          <form action={advanceAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="production_job_id" value={job.id} />
            {view.latestRender !== null ? (
              <input
                type="hidden"
                name="render_job_id"
                value={view.latestRender.id}
              />
            ) : null}
            <AdvanceButtons targets={targets} />
          </form>
        ) : null}

        {!finished && job.status !== "failed" ? (
          <form action={cancelAction}>
            <input type="hidden" name="production_job_id" value={job.id} />
            <CancelButton />
          </form>
        ) : finished && job.status === "ready_for_review" ? (
          <p className="text-[11px] leading-4 text-ink-muted">
            The pipeline&apos;s work is done. Review, approval and scheduling
            are the existing human steps.
          </p>
        ) : null}

        {job.status === "failed" ? (
          <form action={cancelAction}>
            <input type="hidden" name="production_job_id" value={job.id} />
            <CancelButton />
          </form>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The production pipeline panel.
 *
 * Every step is a button the owner presses; nothing advances on its own, and
 * the last status the pipeline can reach is ready for review. There is no
 * publish button here and no path to one.
 */
export function PipelinePanel({
  jobs,
  contentOptions,
}: {
  jobs: PipelineJobView[];
  contentOptions: { id: string; title: string }[];
}) {
  const [createState, createAction] = useActionState(
    createProductionJob,
    {} as PipelineActionState,
  );

  return (
    <div className="flex flex-col gap-4">
      <Messages state={createState} />

      {contentOptions.length > 0 ? (
        <form
          action={createAction}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <label htmlFor="pipeline-content" className="sr-only">
            Content item
          </label>
          <select
            id="pipeline-content"
            name="content_item_id"
            className={FIELD}
            defaultValue=""
          >
            <option value="" disabled>
              Choose a content item…
            </option>
            {contentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
          <CreateButton />
        </form>
      ) : (
        <p className="text-sm text-ink-muted">
          Create a content item first; production jobs track one item each.
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No production jobs yet. Each one walks a content item through the
          optional generation steps and stops at ready for review.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {jobs.map((view) => (
            <JobRow key={view.job.id} view={view} />
          ))}
        </ul>
      )}
    </div>
  );
}
