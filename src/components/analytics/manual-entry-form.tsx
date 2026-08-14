"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { ManualEntryState } from "@/app/dashboard/analytics/actions";
import { recordManualAnalytics } from "@/app/dashboard/analytics/actions";
import { MANUAL_METRIC_SUGGESTIONS } from "@/lib/analytics/manual";
import {
  METRIC_LABELS,
  OBSERVATION_WINDOW_LABELS,
  OBSERVATION_WINDOWS,
  type MetricName,
} from "@/lib/analytics/types";
import { PLATFORM_LABELS, type VariantPlatform } from "@/lib/variants/types";

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
      {pending ? "Saving…" : "Record this figure"}
    </button>
  );
}

/**
 * Entering a figure by hand.
 *
 * Exists mainly for TikTok, which reports nothing this product can legitimately
 * read. Rather than leaving Dave with permanently empty cards, he can copy the
 * numbers out of the TikTok app.
 *
 * **Every figure entered here is labelled as entered by hand, permanently and
 * everywhere.** The form cannot set the source — it is fixed server-side, and
 * the database's insert policy would refuse anything else even if it were not.
 */
export function ManualEntryForm({
  platforms = ["tiktok", "youtube", "instagram"],
}: {
  platforms?: VariantPlatform[];
}) {
  const [state, formAction] = useActionState(
    recordManualAnalytics,
    {} as ManualEntryState,
  );
  const errors = state.fieldErrors ?? {};

  const [platform, setPlatform] = useState<VariantPlatform>(
    platforms[0] ?? "tiktok",
  );

  const suggested =
    MANUAL_METRIC_SUGGESTIONS[
      platform as keyof typeof MANUAL_METRIC_SUGGESTIONS
    ] ?? [];

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
        <div>
          <label htmlFor="manual-platform" className={LABEL}>
            Platform
          </label>
          <select
            id="manual-platform"
            name="platform"
            value={platform}
            onChange={(event) =>
              setPlatform(event.target.value as VariantPlatform)
            }
            className={FIELD}
          >
            {platforms.map((option) => (
              <option key={option} value={option}>
                {PLATFORM_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="manual-metric" className={LABEL}>
            Metric
          </label>
          <select id="manual-metric" name="metric_name" className={FIELD}>
            {suggested.map((metric) => (
              <option key={metric} value={metric}>
                {METRIC_LABELS[metric as MetricName]}
              </option>
            ))}
          </select>
          {errors.metric_name ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.metric_name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="manual-external-id" className={LABEL}>
            Post id at the platform
          </label>
          <input
            id="manual-external-id"
            name="external_post_id"
            className={FIELD}
            placeholder="The id or URL the platform shows"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            Required. A figure with no post attached could never be grouped,
            compared or checked back against the platform.
          </p>
          {errors.external_post_id ? (
            <p className="mt-1.5 text-sm text-red-300">
              {errors.external_post_id}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="manual-value" className={LABEL}>
            Value
          </label>
          <input
            id="manual-value"
            name="metric_value"
            type="number"
            min={0}
            step="1"
            className={FIELD}
          />
          {errors.metric_value ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.metric_value}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="manual-window" className={LABEL}>
            What this figure covers
          </label>
          <select
            id="manual-window"
            name="observation_window"
            defaultValue="lifetime"
            className={FIELD}
          >
            {OBSERVATION_WINDOWS.map((window) => (
              <option key={window} value={window}>
                {OBSERVATION_WINDOW_LABELS[window]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="manual-observed" className={LABEL}>
            Date you read it
          </label>
          <input
            id="manual-observed"
            name="observed_on"
            type="date"
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            When you looked at the platform, not when you are typing.
          </p>
          {errors.observed_on ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.observed_on}</p>
          ) : null}
        </div>
      </div>

      <SaveButton />

      <p className="text-xs leading-5 text-ink-muted">
        Anything recorded here is marked <strong>entered by hand</strong>
        wherever it appears, and is stored separately from figures an API
        reported. A manual entry can never overwrite an API reading, and the
        database will not let a browser write a figure claiming to have come
        from a platform.
      </p>
    </form>
  );
}
