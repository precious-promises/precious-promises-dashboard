import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LOGIN_PATH } from "@/lib/auth/routes";

/**
 * Public landing page.
 *
 * This is the only page an anonymous visitor sees, so it says what the product
 * is and nothing more. No owner identity, no navigation structure, no module
 * names, no counts, no system state — none of that is public information.
 */
export default function HomePage() {
  return (
    <div className="pp-ambient flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-xl border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-base font-semibold text-gold"
        >
          PP
        </span>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
          Precious Promises
        </h1>
        <p className="mt-2 text-base text-ink-secondary sm:text-lg">
          Content &amp; Growth Dashboard
        </p>

        <p className="mt-5 max-w-md text-sm leading-6 text-ink-muted">
          Private administration platform.
        </p>

        <Link
          href={LOGIN_PATH}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Admin Sign In
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </main>

      <footer className="px-6 pb-8 text-center">
        <p className="text-xs text-ink-muted">Precious Promises</p>
      </footer>
    </div>
  );
}
