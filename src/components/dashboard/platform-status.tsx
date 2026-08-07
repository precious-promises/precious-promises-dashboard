import type { LucideIcon } from "lucide-react";

export interface PlatformStatusProps {
  name: string;
  icon: LucideIcon;
}

/**
 * A publishing platform and its connection state.
 *
 * The state is hardcoded to "Not connected" because it is not a guess — no
 * OAuth flow exists, no credential is stored, and nothing in this application
 * has ever contacted these platforms. Showing anything else would be a lie
 * about capability.
 *
 * Connect is a disabled button, not a link: there is no OAuth route to send
 * anyone to.
 */
export function PlatformStatus({ name, icon: Icon }: PlatformStatusProps) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-primary">
            {name}
          </span>
          <span className="block text-xs text-ink-muted">Not connected</span>
        </span>
      </span>
      <button
        type="button"
        disabled
        className="shrink-0 cursor-not-allowed rounded-md border border-edge-strong/70 px-2.5 py-1 text-xs font-medium text-ink-muted opacity-70"
      >
        Connect
        <span className="sr-only"> {name} — coming soon</span>
      </button>
    </li>
  );
}
