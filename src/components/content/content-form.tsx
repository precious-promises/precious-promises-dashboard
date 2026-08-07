"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { ContentActionState } from "@/app/dashboard/content/actions";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DEFAULT_SCRIPTURE_TRANSLATION,
  type ContentItem,
} from "@/lib/content/types";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="mt-1.5 text-sm text-red-300">
      {message}
    </p>
  );
}

function SubmitButton({ label }: { label: string }) {
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

export interface ContentFormProps {
  action: (
    state: ContentActionState,
    formData: FormData,
  ) => Promise<ContentActionState>;
  submitLabel: string;
  /** Present when editing. */
  item?: ContentItem;
}

/**
 * Create and edit form for a content item.
 *
 * There is deliberately no `owner_id` field, hidden or otherwise. Ownership is
 * set from the session in the server action.
 *
 * Scripture text is a plain textarea with no assistance of any kind — no
 * autocomplete, no lookup, no formatting. The application must never generate,
 * complete or alter a verse.
 */
export function ContentForm({ action, submitLabel, item }: ContentFormProps) {
  const [state, formAction] = useActionState(action, {} as ContentActionState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      <div className="pp-glass flex flex-col gap-4 rounded-xl border border-edge px-5 py-5">
        <h2 className="text-sm font-semibold text-ink-primary">Details</h2>

        <div>
          <label htmlFor="title" className={LABEL}>
            Title
          </label>
          <input
            id="title"
            name="title"
            defaultValue={item?.title ?? ""}
            required
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? "title-error" : undefined}
            className={FIELD}
          />
          <FieldError id="title-error" message={errors.title} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="content_type" className={LABEL}>
              Content type
            </label>
            <select
              id="content_type"
              name="content_type"
              defaultValue={item?.content_type ?? ""}
              required
              aria-invalid={errors.content_type ? true : undefined}
              className={FIELD}
            >
              <option value="" disabled>
                Choose a type
              </option>
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <FieldError id="content_type-error" message={errors.content_type} />
          </div>

          <div>
            <label htmlFor="topic" className={LABEL}>
              Topic
            </label>
            <input
              id="topic"
              name="topic"
              defaultValue={item?.topic ?? ""}
              placeholder="e.g. Peace, Provision"
              className={FIELD}
            />
            <FieldError id="topic-error" message={errors.topic} />
          </div>
        </div>

        {item ? (
          <div>
            <label htmlFor="status" className={LABEL}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={item.status}
              className={FIELD}
            >
              {CONTENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CONTENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="pp-glass flex flex-col gap-4 rounded-xl border border-edge px-5 py-5">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">Scripture</h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Enter the reference and wording exactly as they appear in your
            source. Nothing here is generated, completed or corrected
            automatically. New or edited Scripture starts unverified.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="scripture_reference" className={LABEL}>
              Reference
            </label>
            <input
              id="scripture_reference"
              name="scripture_reference"
              defaultValue={item?.scripture_reference ?? ""}
              placeholder="e.g. 2 Peter 1:4"
              autoComplete="off"
              className={FIELD}
            />
            <FieldError
              id="scripture_reference-error"
              message={errors.scripture_reference}
            />
          </div>

          <div>
            <label htmlFor="scripture_translation" className={LABEL}>
              Translation
            </label>
            <input
              id="scripture_translation"
              name="scripture_translation"
              defaultValue={
                item?.scripture_translation ?? DEFAULT_SCRIPTURE_TRANSLATION
              }
              autoComplete="off"
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="scripture_text" className={LABEL}>
            Scripture text
          </label>
          <textarea
            id="scripture_text"
            name="scripture_text"
            defaultValue={item?.scripture_text ?? ""}
            rows={4}
            autoComplete="off"
            spellCheck={false}
            className={FIELD}
          />
          <FieldError
            id="scripture_text-error"
            message={errors.scripture_text}
          />
        </div>
      </div>

      <div className="pp-glass flex flex-col gap-4 rounded-xl border border-edge px-5 py-5">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">
            Description
          </h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Declarations, prayers and commentary belong here — kept separate
            from the Scripture text above.
          </p>
        </div>

        <div>
          <label htmlFor="description" className="sr-only">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={item?.description ?? ""}
            rows={5}
            className={FIELD}
          />
          <FieldError id="description-error" message={errors.description} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
