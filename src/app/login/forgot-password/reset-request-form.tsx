"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type ResetRequestState,
  requestPasswordReset,
} from "./actions";

const INITIAL_STATE: ResetRequestState = {};
const FIELD_CLASSES =
  "rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-base text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending reset link…" : "Send reset link"}
    </button>
  );
}

export function ResetRequestForm() {
  const [state, formAction] = useActionState(
    requestPasswordReset,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4" noValidate>
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
          className="rounded-lg border border-emerald-900/50 bg-emerald-950/35 px-3.5 py-2.5 text-sm text-emerald-200"
        >
          {state.notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-email" className="text-sm font-medium text-ink-secondary">
          Email
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.fieldError ? true : undefined}
          aria-describedby={state.fieldError ? "reset-email-error" : undefined}
          className={FIELD_CLASSES}
        />
        {state.fieldError ? (
          <p id="reset-email-error" className="text-sm text-red-300">
            {state.fieldError}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      <Link
        href="/login"
        className="text-center text-sm font-medium text-highlight-soft underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </form>
  );
}
