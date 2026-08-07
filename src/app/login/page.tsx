import type { Metadata } from "next";

import { ScripturePanel } from "@/components/dashboard/scripture-panel";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in · Precious Promises",
  // A private administration portal; keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Private sign-in page.
 *
 * No registration link, no social sign-in, no password reset, and no
 * testimonials — accounts are created by the owner in Supabase.
 *
 * Deliberately shows no owner identity. Anyone can reach this page, so Dave's
 * name and role stay behind authentication.
 *
 * Two panels on desktop, single column on mobile — not a shrunken desktop
 * layout: the brand panel is dropped entirely rather than stacked, since on a
 * phone it would just push the form below the fold.
 */
export default function LoginPage() {
  return (
    <div className="pp-ambient flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel — desktop only. */}
      <section
        aria-hidden="true"
        className="relative hidden w-[46%] shrink-0 flex-col justify-between border-r border-edge bg-panel/50 px-12 py-14 lg:flex"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-sm font-semibold text-gold">
            PP
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-primary">
              Precious Promises
            </span>
            <span className="block text-xs text-ink-muted">
              Content &amp; Growth
            </span>
          </span>
        </div>

        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-ink-primary">
            Content, production and growth in one place.
          </p>
          <p className="mt-3 text-sm leading-6 text-ink-secondary">
            A private workspace for planning, producing and approving Precious
            Promises content.
          </p>
        </div>

        <div className="max-w-sm">
          <ScripturePanel />
        </div>
      </section>

      {/* Form panel. */}
      <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-2 text-center lg:text-left">
            <span
              aria-hidden="true"
              className="mx-auto flex size-11 items-center justify-center rounded-xl border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-sm font-semibold text-gold lg:hidden"
            >
              PP
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">
              Precious Promises
            </h1>
            <p className="text-sm text-ink-secondary">
              Content &amp; Growth Dashboard
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-xs text-ink-muted lg:text-left">
            Private administration portal
          </p>
        </div>
      </main>
    </div>
  );
}
