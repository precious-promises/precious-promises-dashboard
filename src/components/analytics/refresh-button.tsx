"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { RefreshState } from "@/app/dashboard/analytics/actions";
import { refreshAnalytics } from "@/app/dashboard/analytics/actions";
import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Fetch analytics now.
 *
 * **Deliberately independent of Trigger.dev.** No project is connected, and
 * Dave should not have to deploy a scheduler to see his own figures. This runs
 * the same orchestration the scheduled task would.
 */
function Button({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Fetching…" : label}
    </button>
  );
}

export function AnalyticsRefreshButton({
  platform,
  label = "Refresh now",
}: {
  platform: VariantPlatform;
  label?: string;
}) {
  const [state, formAction] = useActionState(
    refreshAnalytics,
    {} as RefreshState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="platform" value={platform} />
      <Button label={label} />

      {state.error ? (
        <p role="alert" className="max-w-xs text-right text-[11px] text-gold">
          {state.error}
        </p>
      ) : null}

      {state.notice ? (
        <p
          role="status"
          className="max-w-xs text-right text-[11px] text-ink-muted"
        >
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
