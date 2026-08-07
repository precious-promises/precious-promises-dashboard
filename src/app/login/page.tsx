import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Precious Promises",
  // This is a private dashboard; keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Private sign-in page.
 *
 * There is deliberately no registration link or sign-up route. Accounts are
 * created by the owner in Supabase — see docs/supabase-setup.md.
 *
 * An already-authenticated visitor is redirected to the dashboard by the proxy
 * before this renders.
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Precious Promises
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Sign in to the content dashboard.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
