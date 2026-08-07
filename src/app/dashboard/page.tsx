import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Dashboard · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Temporary private dashboard.
 *
 * This is a Stage 0 placeholder that proves the authentication foundation
 * works end to end. The Stage 1 dashboard interface is not built yet.
 *
 * The session is checked here as well as in the proxy. That redundancy is
 * deliberate: proxy matchers are easy to misconfigure, and a page that renders
 * private content should not depend on one for its access control.
 */
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-12 sm:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Precious Promises Content Dashboard
        </h1>
        <LogoutButton />
      </header>

      <section className="flex flex-col gap-1">
        <p className="text-lg font-medium">Dave</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Founder &amp; Creator
        </p>
      </section>

      <p className="text-base">Foundation connected successfully.</p>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Signed in as <span className="font-medium">{user.email}</span>
      </p>
    </main>
  );
}
