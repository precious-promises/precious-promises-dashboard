"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ExperimentActionState } from "@/app/dashboard/growth/actions";
import {
  concludeExperiment,
  createExperiment,
} from "@/app/dashboard/growth/actions";
import {
  EXPERIMENT_DIMENSION_LABELS,
  EXPERIMENT_DIMENSIONS,
  OBSERVATIONAL_NOTE,
} from "@/lib/growth/experiments";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * Starting a content experiment.
 *
 * The hypothesis is required, and that is the point of the form. Writing down
 * what you expect **before** you look is the only thing separating an
 * experiment from a story told afterwards about numbers that already existed.
 */
export function ExperimentForm() {
  const [state, formAction] = useActionState(
    createExperiment,
    {} as ExperimentActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm text-ink-secondary"
        >
          {state.notice}
        </p>
      ) : null}

      <div>
        <label htmlFor="experiment-name" className={LABEL}>
          Name
        </label>
        <input
          id="experiment-name"
          name="name"
          className={FIELD}
          placeholder="Question titles on Shorts"
        />
        {errors.name ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.name}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="experiment-hypothesis" className={LABEL}>
          What do you expect to see?
        </label>
        <textarea
          id="experiment-hypothesis"
          name="hypothesis"
          rows={3}
          className={FIELD}
          placeholder="Shorts whose title asks a question will hold attention longer than ones that state."
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          Written before you look. This is what separates an experiment from a
          story told afterwards about numbers that were already there.
        </p>
        {errors.hypothesis ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.hypothesis}</p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="experiment-dimension" className={LABEL}>
            What is changing?
          </label>
          <select id="experiment-dimension" name="dimension" className={FIELD}>
            {EXPERIMENT_DIMENSIONS.map((dimension) => (
              <option key={dimension} value={dimension}>
                {EXPERIMENT_DIMENSION_LABELS[dimension]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="experiment-start" className={LABEL}>
            Starting on
          </label>
          <input
            id="experiment-start"
            name="started_on"
            type="date"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Leave blank to keep it as a plan.
          </p>
        </div>
      </div>

      <SubmitButton label="Start experiment" pendingLabel="Saving…" />

      <p className="text-xs leading-5 text-ink-muted">{OBSERVATIONAL_NOTE}</p>
    </form>
  );
}

/**
 * Concluding an experiment.
 *
 * **The owner writes the conclusion.** Nothing computes a winner. The system
 * can show what the numbers did; deciding what it means over a handful of
 * posts that differ in more than one respect is a judgement, and this form is
 * where a human makes it.
 */
export function ConcludeExperimentForm({
  experimentId,
  canConclude,
  readinessReason,
}: {
  experimentId: string;
  canConclude: boolean;
  readinessReason: string;
}) {
  const [state, formAction] = useActionState(
    concludeExperiment,
    {} as ExperimentActionState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="experiment_id" value={experimentId} />

      {state.error ? (
        <p role="alert" className="text-[11px] text-red-300">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p role="status" className="text-[11px] text-ink-muted">
          {state.notice}
        </p>
      ) : null}

      <p className="text-[11px] leading-5 text-ink-muted">{readinessReason}</p>

      <textarea
        name="observation"
        rows={2}
        className={`${FIELD} text-xs`}
        placeholder="What did you actually see? In your own words."
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={canConclude ? "observed" : "inconclusive"}
          className="rounded-lg border border-edge bg-panel-raised/50 px-2.5 py-1.5 text-xs text-ink-primary"
        >
          <option value="observed">Observed something</option>
          <option value="inconclusive">Could not tell</option>
          <option value="abandoned">Abandoned</option>
        </select>

        <button
          type="submit"
          className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Record the outcome
        </button>
      </div>
    </form>
  );
}
