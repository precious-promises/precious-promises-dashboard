"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  type PasswordActionState,
  changePassword,
} from "@/app/dashboard/settings/password-actions";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

const INITIAL_STATE: PasswordActionState = {};

function ChangePasswordButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Changing password…" : "Change password"}
    </button>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changePassword, INITIAL_STATE);
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
        <label htmlFor="current-password" className={LABEL}>
          Current password
        </label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.currentPassword ? true : undefined}
          aria-describedby={
            state.fieldErrors?.currentPassword
              ? "current-password-error"
              : undefined
          }
          className={FIELD}
        />
        {state.fieldErrors?.currentPassword ? (
          <p
            id="current-password-error"
            className="mt-1.5 text-sm text-red-300"
          >
            {state.fieldErrors.currentPassword}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-password" className={LABEL}>
            New password
          </label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            aria-invalid={state.fieldErrors?.newPassword ? true : undefined}
            aria-describedby={
              state.fieldErrors?.newPassword ? "new-password-error" : undefined
            }
            className={FIELD}
          />
          {state.fieldErrors?.newPassword ? (
            <p id="new-password-error" className="mt-1.5 text-sm text-red-300">
              {state.fieldErrors.newPassword}
            </p>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">
              Use at least 8 characters. A longer, unique password is better.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className={LABEL}>
            Confirm new password
          </label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={state.fieldErrors?.confirmPassword ? true : undefined}
            aria-describedby={
              state.fieldErrors?.confirmPassword
                ? "confirm-password-error"
                : undefined
            }
            className={FIELD}
          />
          {state.fieldErrors?.confirmPassword ? (
            <p
              id="confirm-password-error"
              className="mt-1.5 text-sm text-red-300"
            >
              {state.fieldErrors.confirmPassword}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-ink-muted">
          Your password is sent only to Supabase Auth for this authenticated
          change. It is never stored in Precious Promises application tables.
        </p>
        <ChangePasswordButton />
      </div>
    </form>
  );
}
