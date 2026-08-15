"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { PlannerActionState } from "@/app/dashboard/planner/actions";
import {
  createPlannerItem,
  updatePlannerItem,
} from "@/app/dashboard/planner/actions";
import {
  PLANNER_PRIORITIES,
  PLANNER_PRIORITY_LABELS,
  PLANNER_STATUSES,
  PLANNER_STATUS_LABELS,
  type PlannerItem,
} from "@/lib/planner/types";
import { PLATFORM_LABELS, VARIANT_PLATFORMS } from "@/lib/variants/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * Create or edit one plan item. Planning only: the form has no scheduling
 * field and no publish concept, because the planner has neither.
 */
export function PlannerForm({ item }: { item?: PlannerItem }) {
  const [state, formAction] = useActionState(
    item ? updatePlannerItem : createPlannerItem,
    {} as PlannerActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {item ? (
        <input type="hidden" name="planner_item_id" value={item.id} />
      ) : null}

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
          <label htmlFor="planner-title" className={LABEL}>
            Title
          </label>
          <input
            id="planner-title"
            name="title"
            defaultValue={item?.title ?? ""}
            className={FIELD}
            placeholder="What is this piece of content?"
          />
          {errors.title ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.title}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="planner-topic" className={LABEL}>
            Topic
          </label>
          <input
            id="planner-topic"
            name="topic"
            defaultValue={item?.topic ?? ""}
            className={FIELD}
            placeholder="Healing, Peace, Faith…"
          />
        </div>

        <div>
          <label htmlFor="planner-type" className={LABEL}>
            Content type
          </label>
          <input
            id="planner-type"
            name="content_type"
            defaultValue={item?.content_type ?? ""}
            className={FIELD}
            placeholder="Short, teaching, sleep video…"
          />
        </div>

        <div>
          <span className={LABEL}>Target platforms</span>
          <div className="flex flex-wrap gap-3 rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5">
            {VARIANT_PLATFORMS.map((platform) => (
              <label
                key={platform}
                className="flex items-center gap-1.5 text-sm text-ink-secondary"
              >
                <input
                  type="checkbox"
                  name="target_platforms"
                  value={platform}
                  defaultChecked={item?.target_platforms.includes(platform)}
                />
                {PLATFORM_LABELS[platform]}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="planner-date" className={LABEL}>
            Target date
          </label>
          <input
            id="planner-date"
            name="target_date"
            type="date"
            defaultValue={item?.target_date ?? ""}
            className={FIELD}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            An intention, not a schedule. Scheduling stays on the Calendar.
          </p>
        </div>

        <div>
          <label htmlFor="planner-priority" className={LABEL}>
            Priority
          </label>
          <select
            id="planner-priority"
            name="priority"
            defaultValue={item?.priority ?? "normal"}
            className={FIELD}
          >
            {PLANNER_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PLANNER_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="planner-status" className={LABEL}>
            Status
          </label>
          <select
            id="planner-status"
            name="status"
            defaultValue={item?.status ?? "idea"}
            className={FIELD}
          >
            {PLANNER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PLANNER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="planner-series" className={LABEL}>
            Series
          </label>
          <input
            id="planner-series"
            name="series"
            defaultValue={item?.series ?? ""}
            className={FIELD}
            placeholder="Optional series or campaign name"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="planner-notes" className={LABEL}>
            Notes
          </label>
          <textarea
            id="planner-notes"
            name="notes"
            rows={3}
            defaultValue={item?.notes ?? ""}
            className={FIELD}
          />
        </div>
      </div>

      <SaveButton label={item ? "Save changes" : "Add to the plan"} />
    </form>
  );
}
