"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { LicenceActionState } from "@/app/dashboard/rights/actions";
import {
  createLicenceRecord,
  updateLicenceRecord,
} from "@/app/dashboard/rights/actions";
import {
  LICENCE_STATUSES,
  LICENCE_STATUS_LABELS,
  type LicenceRecord,
} from "@/lib/rights/types";

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

export function LicenceForm({ record }: { record?: LicenceRecord }) {
  const [state, formAction] = useActionState(
    record ? updateLicenceRecord : createLicenceRecord,
    {} as LicenceActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {record ? (
        <input type="hidden" name="licence_record_id" value={record.id} />
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
          <label htmlFor="licence-label" className={LABEL}>
            Asset
          </label>
          <input
            id="licence-label"
            name="asset_label"
            defaultValue={record?.asset_label ?? ""}
            className={FIELD}
            placeholder="What is this record about?"
          />
          {errors.asset_label ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.asset_label}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="licence-source" className={LABEL}>
            Rights source
          </label>
          <input
            id="licence-source"
            name="rights_source"
            defaultValue={record?.rights_source ?? ""}
            className={FIELD}
            placeholder="Where the right comes from"
          />
        </div>

        <div>
          <label htmlFor="licence-type" className={LABEL}>
            Licence type
          </label>
          <input
            id="licence-type"
            name="licence_type"
            defaultValue={record?.licence_type ?? ""}
            className={FIELD}
            placeholder="Standard licence, CC-BY, purchase…"
          />
        </div>

        <div>
          <label htmlFor="licence-licensor" className={LABEL}>
            Licensor
          </label>
          <input
            id="licence-licensor"
            name="licensor"
            defaultValue={record?.licensor ?? ""}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="licence-proof" className={LABEL}>
            Proof reference
          </label>
          <input
            id="licence-proof"
            name="proof_reference"
            defaultValue={record?.proof_reference ?? ""}
            className={FIELD}
            placeholder="Receipt, order number, document location"
          />
        </div>

        <div>
          <label htmlFor="licence-start" className={LABEL}>
            Starts
          </label>
          <input
            id="licence-start"
            name="starts_on"
            type="date"
            defaultValue={record?.starts_on ?? ""}
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="licence-expiry" className={LABEL}>
            Expires
          </label>
          <input
            id="licence-expiry"
            name="expires_on"
            type="date"
            defaultValue={record?.expires_on ?? ""}
            className={FIELD}
          />
          {errors.expires_on ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.expires_on}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="licence-status" className={LABEL}>
            Status
          </label>
          <select
            id="licence-status"
            name="status"
            defaultValue={record?.status ?? "needs_review"}
            className={FIELD}
          >
            {LICENCE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LICENCE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="licence-permitted" className={LABEL}>
            Permitted use
          </label>
          <textarea
            id="licence-permitted"
            name="permitted_use"
            rows={2}
            defaultValue={record?.permitted_use ?? ""}
            className={FIELD}
            placeholder="What the licence allows, in Dave's words"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="licence-notes" className={LABEL}>
            Notes
          </label>
          <textarea
            id="licence-notes"
            name="notes"
            rows={2}
            defaultValue={record?.notes ?? ""}
            className={FIELD}
          />
        </div>
      </div>

      <SaveButton label={record ? "Save changes" : "Add to the register"} />
    </form>
  );
}
