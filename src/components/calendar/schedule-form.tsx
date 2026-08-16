"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  schedulePost,
  type ScheduleActionState,
} from "@/app/dashboard/calendar/actions";
import { CONTENT_TYPE_LABELS } from "@/lib/content/types";
import { DEFAULT_TIMEZONE } from "@/lib/schedule/timezone";
import { PLATFORM_LABELS, VARIANT_TYPE_LABELS } from "@/lib/variants/types";

/**
 * Schedule an approved variant.
 *
 * The list only offers variants whose approval is currently **valid** — an
 * approval whose fingerprint no longer matches its content is not offered at
 * all. The server re-checks the same thing on submit, because the page may
 * have been open while the content changed.
 */

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1 block text-xs font-medium text-ink-secondary";

export interface SchedulableVariant {
  id: string;
  itemTitle: string;
  platform: keyof typeof PLATFORM_LABELS;
  variantType: keyof typeof VARIANT_TYPE_LABELS;
  contentType: keyof typeof CONTENT_TYPE_LABELS;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Scheduling…" : "Schedule"}
    </button>
  );
}

export function ScheduleForm({
  variants,
  selectedVariantId,
  timezone = DEFAULT_TIMEZONE,
}: {
  variants: SchedulableVariant[];
  selectedVariantId: string | null;
  timezone?: string;
}) {
  const [state, formAction] = useActionState(
    schedulePost,
    {} as ScheduleActionState,
  );
  const errors = state.fieldErrors ?? {};

  if (variants.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing is approved yet. A variant can only be scheduled once it has
        been approved and its approval still matches its content.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      {state.duplicateWarning ? (
        <p
          role="alert"
          className="rounded-lg border border-gold-dim/50 bg-gold/10 px-3 py-2 text-sm text-gold"
        >
          {state.duplicateWarning}
        </p>
      ) : null}

      <div>
        <label htmlFor="platform_variant_id" className={LABEL}>
          Approved variant
        </label>
        <select
          id="platform_variant_id"
          name="platform_variant_id"
          defaultValue={selectedVariantId ?? ""}
          className={FIELD}
        >
          <option value="">Choose an approved variant…</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.itemTitle} — {PLATFORM_LABELS[variant.platform]}{" "}
              {VARIANT_TYPE_LABELS[variant.variantType]}
            </option>
          ))}
        </select>
        {errors.platform_variant_id ? (
          <p className="mt-1 text-sm text-red-300">
            {errors.platform_variant_id}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="date" className={LABEL}>
            Date
          </label>
          <input id="date" name="date" type="date" className={FIELD} />
          {errors.date ? (
            <p className="mt-1 text-sm text-red-300">{errors.date}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor="time" className={LABEL}>
            Time
          </label>
          <input id="time" name="time" type="time" className={FIELD} />
          {errors.time ? (
            <p className="mt-1 text-sm text-red-300">{errors.time}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="timezone" className={LABEL}>
          Timezone
        </label>
        <input
          id="timezone"
          name="timezone"
          type="text"
          defaultValue={timezone}
          className={FIELD}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Stored in UTC. This zone is kept alongside it, so a daylight-saving
          change cannot move the time you chose.
        </p>
        {errors.timezone ? (
          <p className="mt-1 text-sm text-red-300">{errors.timezone}</p>
        ) : null}
      </div>

      {state.duplicateWarning ? (
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            name="confirm_duplicate"
            className="accent-highlight"
          />
          Schedule it anyway
        </label>
      ) : null}

      <div>
        <SubmitButton />
        <p className="mt-1.5 text-xs text-ink-muted">
          Scheduling records an intention. The publish run sends it when due —
          and only if the approval still matches and the platform is connected.
        </p>
      </div>
    </form>
  );
}
