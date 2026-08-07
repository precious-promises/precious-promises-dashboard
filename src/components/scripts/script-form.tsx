"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ScriptActionState } from "@/app/dashboard/scripts/actions";
import { saveScriptRevision } from "@/app/dashboard/scripts/actions";
import {
  SCRIPT_SECTIONS,
  SCRIPT_SECTION_HINTS,
  SCRIPT_SECTION_LABELS,
  type ScriptRevision,
} from "@/lib/scripts/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";

const ROWS: Record<(typeof SCRIPT_SECTIONS)[number], number> = {
  hook: 3,
  explanation: 8,
  declaration: 5,
  prayer: 5,
  outro: 3,
  notes: 4,
};

function SubmitButton({ nextRevision }: { nextRevision: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : `Save as revision ${nextRevision}`}
    </button>
  );
}

/**
 * Script editor.
 *
 * Saving always creates a new revision — there is no in-place edit — so the
 * button says which number is about to be written.
 *
 * Every field here is prose the owner wrote. There is no Scripture input: the
 * verse is displayed read-only beside this form, and cannot be reached from
 * it.
 */
export function ScriptForm({
  contentItemId,
  latest,
  nextRevision,
}: {
  contentItemId: string;
  latest: ScriptRevision | null;
  nextRevision: number;
}) {
  const [state, formAction] = useActionState(
    saveScriptRevision,
    {} as ScriptActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="content_item_id" value={contentItemId} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      {SCRIPT_SECTIONS.map((section) => (
        <div key={section}>
          <label
            htmlFor={section}
            className="mb-1 block text-sm font-medium text-ink-secondary"
          >
            {SCRIPT_SECTION_LABELS[section]}
          </label>
          <p className="mb-1.5 text-xs text-ink-muted">
            {SCRIPT_SECTION_HINTS[section]}
          </p>
          <textarea
            id={section}
            name={section}
            rows={ROWS[section]}
            defaultValue={latest?.[section] ?? ""}
            aria-invalid={errors[section] ? true : undefined}
            className={FIELD}
          />
          {errors[section] ? (
            <p className="mt-1.5 text-sm text-red-300">{errors[section]}</p>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton nextRevision={nextRevision} />
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-lg border border-edge-strong/70 px-4 py-2.5 text-sm font-medium text-ink-muted opacity-70"
        >
          Generate with AI
          <span className="sr-only"> — coming soon</span>
        </button>
        <span aria-hidden="true" className="text-xs text-ink-muted">
          Coming soon
        </span>
      </div>
    </form>
  );
}
