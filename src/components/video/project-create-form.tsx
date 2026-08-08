"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createVideoProject,
  type ProjectActionState,
} from "@/app/dashboard/video/actions";
import type { ContentItem } from "@/lib/content/types";
import { CONTENT_TYPE_LABELS } from "@/lib/content/types";
import { ASPECT_RATIOS, ASPECT_RATIO_LABELS } from "@/lib/video/types";

/**
 * Create a video project from an existing content item.
 *
 * A project is always built from a content item — that is where the Scripture
 * lives, and a project with no source would have nothing verified to reference.
 * There is deliberately no "blank project" option.
 */

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create project"}
    </button>
  );
}

export function ProjectCreateForm({ items }: { items: ContentItem[] }) {
  const [state, formAction] = useActionState(
    createVideoProject,
    {} as ProjectActionState,
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

      <div>
        <label htmlFor="name" className={LABEL}>
          Project name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={200}
          aria-invalid={errors.name ? true : undefined}
          className={FIELD}
        />
        {errors.name ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.name}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="content_item_id" className={LABEL}>
          Content item
        </label>
        <select
          id="content_item_id"
          name="content_item_id"
          defaultValue=""
          aria-invalid={errors.content_item_id ? true : undefined}
          className={FIELD}
        >
          <option value="">Choose a content item…</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {CONTENT_TYPE_LABELS[item.content_type]}
            </option>
          ))}
        </select>
        {errors.content_item_id ? (
          <p className="mt-1.5 text-sm text-red-300">
            {errors.content_item_id}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className={LABEL}>Aspect ratio</legend>
        <div className="flex flex-wrap gap-2">
          {ASPECT_RATIOS.map((ratio, index) => (
            <label
              key={ratio}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-panel-raised/40 px-3.5 py-2 text-sm text-ink-secondary transition-colors has-checked:border-highlight has-checked:bg-highlight/10 has-checked:text-ink-primary"
            >
              <input
                type="radio"
                name="aspect_ratio"
                value={ratio}
                defaultChecked={index === 0}
                className="accent-highlight"
              />
              {ASPECT_RATIO_LABELS[ratio]}
            </label>
          ))}
        </div>
        {errors.aspect_ratio ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.aspect_ratio}</p>
        ) : null}
      </fieldset>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
