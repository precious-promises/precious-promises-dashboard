"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type PasswordActionState,
  changePassword,
} from "@/app/dashboard/settings/password-actions";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 pr-12 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";
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

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
  hint,
}: {
  id: string;
  name: "currentPassword" | "newPassword" | "confirmPassword";
  label: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={name === "newPassword" ? 8 : undefined}
          maxLength={name === "newPassword" ? 128 : undefined}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={FIELD}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-muted transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-highlight"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4.5" />
          ) : (
            <Eye aria-hidden="true" className="size-4.5" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-5 text-ink-muted">{hint}</p>
      ) : null}
    </div>
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
      autoComplete="on"
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

      <PasswordField
        id="current-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        error={state.fieldErrors?.currentPassword}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          id="new-password"
          name="newPassword"
          label="New password"
          autoComplete="new-password"
          error={state.fieldErrors?.newPassword}
          hint="Use at least 8 characters. A longer, unique password is better."
        />
        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          error={state.fieldErrors?.confirmPassword}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-ink-muted">
          Use the eye buttons to check what you typed. Your browser or password
          manager may also offer to save the updated sign-in. Precious Promises
          does not store a readable password in its application tables.
        </p>
        <ChangePasswordButton />
      </div>
    </form>
  );
}
