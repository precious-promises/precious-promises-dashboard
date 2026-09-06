"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, signIn } from "./actions";

const INITIAL_STATE: LoginState = {};

const FIELD_CLASSES =
  "rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-base text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35 aria-[invalid=true]:border-red-500/60";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign In"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-4"
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

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-sm font-medium text-ink-secondary"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="username"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : undefined
          }
          className={FIELD_CLASSES}
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-sm text-red-300">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="password"
            className="text-sm font-medium text-ink-secondary"
          >
            Password
          </label>
          <Link
            href="/login/forgot-password"
            className="text-xs font-medium text-highlight-soft underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={state.fieldErrors?.password ? true : undefined}
            aria-describedby={
              state.fieldErrors?.password ? "password-error" : undefined
            }
            className={`${FIELD_CLASSES} w-full pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-muted transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-highlight"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4.5" />
            ) : (
              <Eye aria-hidden="true" className="size-4.5" />
            )}
          </button>
        </div>
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-sm text-red-300">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-ink-muted">
        Your browser or Google Password Manager can save this sign-in securely
        and offer it next time. Precious Promises never stores a readable copy
        of the password in the dashboard.
      </p>

      <SubmitButton />
    </form>
  );
}
