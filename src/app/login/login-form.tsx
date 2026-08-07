"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { type LoginState, signIn } from "./actions";

const INITIAL_STATE: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-sky-600 px-4 py-2 font-medium text-white transition-colors hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={state.fieldErrors?.email ? true : undefined}
          aria-describedby={
            state.fieldErrors?.email ? "email-error" : undefined
          }
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-base outline-none focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400/40"
        />
        {state.fieldErrors?.email ? (
          <p id="email-error" className="text-sm text-red-300">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.fieldErrors?.password ? true : undefined}
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-base outline-none focus-visible:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400/40"
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-sm text-red-300">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}
