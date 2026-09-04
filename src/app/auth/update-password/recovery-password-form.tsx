"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { type RecoveryPasswordState, updateRecoveredPassword } from "./actions";

const INITIAL_STATE: RecoveryPasswordState = {};
const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Updating password…" : "Set new password"}
    </button>
  );
}

export function RecoveryPasswordForm() {
  const [state, formAction] = useActionState(
    updateRecoveredPassword,
    INITIAL_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.notice) {
      formRef.current?.reset();
    }
  }, [state.notice]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
    >
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

      <div>
        <label htmlFor="recovery-new-password" className={LABEL}>
          New password
        </label>
        <input
          id="recovery-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          aria-invalid={state.fieldErrors?.newPassword ? true : undefined}
          aria-describedby={
            state.fieldErrors?.newPassword
              ? "recovery-new-password-error"
              : undefined
          }
          className={FIELD}
        />
        {state.fieldErrors?.newPassword ? (
          <p
            id="recovery-new-password-error"
            className="mt-1.5 text-sm text-red-300"
          >
            {state.fieldErrors.newPassword}
          </p>
        ) : (
          <p className="mt-1.5 text-xs leading-5 text-ink-muted">
            Use at least 8 characters. A longer, unique password is better.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="recovery-confirm-password" className={LABEL}>
          Confirm new password
        </label>
        <input
          id="recovery-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
          aria-describedby={
            state.fieldErrors?.confirmPassword
              ? "recovery-confirm-password-error"
              : undefined
          }
          className={FIELD}
        />
        {state.fieldErrors?.confirmPassword ? (
          <p
            id="recovery-confirm-password-error"
            className="mt-1.5 text-sm text-red-300"
          >
            {state.fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <SubmitButton />

      {state.notice ? (
        <Link
          href="/dashboard"
          className="text-center text-sm font-medium text-highlight-soft underline-offset-4 hover:underline"
        >
          Continue to dashboard
        </Link>
      ) : null}
    </form>
  );
}
