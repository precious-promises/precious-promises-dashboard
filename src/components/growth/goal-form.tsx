"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { GoalActionState } from "@/app/dashboard/growth/actions";
import { createGoal } from "@/app/dashboard/growth/actions";
import { GOAL_METRIC_LABELS, GOAL_METRICS } from "@/lib/growth/goals";
import { PLATFORM_LABELS } from "@/lib/variants/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Set this goal"}
    </button>
  );
}

/**
 * Setting a growth goal.
 *
 * **A target, never a prediction.** Nothing in this form or anywhere near it
 * forecasts what will happen — it records what Dave decided to aim at, and the
 * Growth Centre compares it against what has actually been measured.
 */
export function GoalForm() {
  const [state, formAction] = useActionState(createGoal, {} as GoalActionState);
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="goal-name" className={LABEL}>
            What are you aiming at?
          </label>
          <input
            id="goal-name"
            name="name"
            className={FIELD}
            placeholder="Twelve Shorts this quarter"
          />
          {errors.name ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="goal-metric" className={LABEL}>
            Measured by
          </label>
          <select id="goal-metric" name="metric" className={FIELD}>
            {GOAL_METRICS.map((metric) => (
              <option key={metric} value={metric}>
                {GOAL_METRIC_LABELS[metric]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="goal-platform" className={LABEL}>
            Platform
          </label>
          <select id="goal-platform" name="platform" className={FIELD}>
            <option value="">Across everything</option>
            {(["youtube", "instagram", "tiktok"] as const).map((platform) => (
              <option key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="goal-target" className={LABEL}>
            Target
          </label>
          <input
            id="goal-target"
            name="target_value"
            type="number"
            min={1}
            step="1"
            className={FIELD}
          />
          {errors.target_value ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.target_value}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="goal-start" className={LABEL}>
              From
            </label>
            <input
              id="goal-start"
              name="period_start"
              type="date"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="goal-end" className={LABEL}>
              To
            </label>
            <input
              id="goal-end"
              name="period_end"
              type="date"
              className={FIELD}
            />
            {errors.period_end ? (
              <p className="mt-1.5 text-sm text-red-300">{errors.period_end}</p>
            ) : null}
          </div>
        </div>
      </div>

      <SaveButton />

      <p className="text-xs leading-5 text-ink-muted">
        A goal is something you decided to aim at. It is stored apart from
        measured figures so no chart can plot an intention as an observation,
        and progress toward it shows as unmeasured — never as 0% — until
        something has genuinely been read from the platform.
      </p>
    </form>
  );
}
