"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import type { VariantActionState } from "@/app/dashboard/captions/actions";
import { saveVariant } from "@/app/dashboard/captions/actions";
import {
  PLATFORM_VARIANT_TYPES,
  VARIANT_TYPE_LABELS,
  type PlatformVariant,
  type VariantPlatform,
} from "@/lib/variants/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

/**
 * A character counter with no limit attached.
 *
 * Deliberately informational. This codebase does not assert a platform's
 * character limit unless it has been verified against current official
 * documentation, and none has — so the counter counts and says nothing about
 * whether the value would be accepted.
 */
function Counter({ value }: { value: string }) {
  return (
    <span className="text-xs tabular-nums text-ink-muted">
      {value.length} characters
    </span>
  );
}

function CountedField({
  id,
  name,
  label,
  defaultValue,
  rows,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  rows?: number;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <Counter value={value} />
      </div>
      {rows ? (
        <textarea
          id={id}
          name={name}
          rows={rows}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          aria-invalid={error ? true : undefined}
          className={FIELD}
        />
      ) : (
        <input
          id={id}
          name={name}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          aria-invalid={error ? true : undefined}
          className={FIELD}
        />
      )}
      {error ? <p className="mt-1.5 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

function SubmitButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        name="review_state"
        value="draft"
        disabled={pending}
        className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save draft"}
      </button>
      <button
        type="submit"
        name="review_state"
        value="ready_for_review"
        disabled={pending}
        className="rounded-lg border border-edge-strong px-5 py-2.5 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
      >
        Mark ready for review
      </button>
    </div>
  );
}

export function VariantForm({
  contentItemId,
  platform,
  variant,
}: {
  contentItemId: string;
  platform: VariantPlatform;
  variant: PlatformVariant | null;
}) {
  const [state, formAction] = useActionState(
    saveVariant,
    {} as VariantActionState,
  );
  const errors = state.fieldErrors ?? {};
  const types = PLATFORM_VARIANT_TYPES[platform];

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="content_item_id" value={contentItemId} />
      <input type="hidden" name="platform" value={platform} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="variant_type" className={LABEL}>
          Variant type
        </label>
        <select
          id="variant_type"
          name="variant_type"
          defaultValue={variant?.variant_type ?? types[0]}
          className={FIELD}
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {VARIANT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {errors.variant_type ? (
          <p className="mt-1.5 text-sm text-red-300">{errors.variant_type}</p>
        ) : null}
      </div>

      <CountedField
        id="title"
        name="title"
        label="Title"
        defaultValue={variant?.title ?? ""}
        error={errors.title}
      />

      <CountedField
        id="caption"
        name="caption"
        label="Caption"
        rows={5}
        defaultValue={variant?.caption ?? ""}
        error={errors.caption}
      />

      <CountedField
        id="description"
        name="description"
        label="Description"
        rows={6}
        defaultValue={variant?.description ?? ""}
        error={errors.description}
      />

      <div>
        <label htmlFor="hashtags" className={LABEL}>
          Hashtags
        </label>
        <input
          id="hashtags"
          name="hashtags"
          defaultValue={(variant?.hashtags ?? []).join(" ")}
          placeholder="peace promises scripture"
          className={FIELD}
        />
        <p className="mt-1.5 text-xs text-ink-muted">
          Separated by spaces or commas. A leading # is optional and duplicates
          are removed.
        </p>
      </div>

      <CountedField
        id="first_comment"
        name="first_comment"
        label="First comment"
        rows={3}
        defaultValue={variant?.first_comment ?? ""}
        error={errors.first_comment}
      />

      <CountedField
        id="cta"
        name="cta"
        label="Call to action"
        defaultValue={variant?.cta ?? ""}
        error={errors.cta}
      />

      <CountedField
        id="thumbnail_text"
        name="thumbnail_text"
        label="Thumbnail text"
        defaultValue={variant?.thumbnail_text ?? ""}
        error={errors.thumbnail_text}
      />

      <SubmitButtons />

      <p className="text-xs leading-5 text-ink-muted">
        Marking a variant ready for review publishes nothing. There is no
        publishing integration, and no scheduler reads this state — it is a note
        to a human that the wording is finished.
      </p>
    </form>
  );
}
