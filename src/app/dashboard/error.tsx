"use client";

import Link from "next/link";

/** Failed reads must not masquerade as empty queues or disconnected accounts. */
export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6"
    >
      <p className="text-xs uppercase tracking-widest text-gold">
        Precious Promises
      </p>
      <h1 className="text-2xl font-semibold">Workspace data is unavailable</h1>
      <p className="text-sm leading-6 text-ink-secondary">
        We could not read all the information needed for this page. Counts and
        connection states cannot be confirmed right now.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-edge px-4 py-2 text-sm"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
