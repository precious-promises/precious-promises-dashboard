"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { type RecoveryPasswordState, updateRecoveredPassword } from "./actions";

const INITIAL_STATE: RecoveryPasswordState = {};
const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 pr-12 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";
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

function RecoveryPasswordField({
  id,
  name,
  label,
  error,
  hint,
}: {
  id: string;
  name: "newPassword" | "confirmPassword";
  label: string;
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
          autoComplete="new-password"
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
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
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

      <RecoveryPasswordField
        id="recovery-new-password"
        name="newPassword"
        label="New password"
        error={state.fieldErrors?.newPassword}
        hint="Use at least 8 characters. A longer, unique password is better."
      />

      <RecoveryPasswordField
        id="recovery-confirm-password"
        name="confirmPassword"
        label="Confirm new password"
        error={state.fieldErrors?.confirmPassword}
      />

      <p className="text-xs leading-5 text-ink-muted">
        Use the eye buttons to verify what you typed. Your browser or password
        manager may offer to save the new sign-in after the password changes.
      </p>

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
