import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { CONNECTED_ACCOUNTS_PATH } from "@/config/navigation";
import {
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
} from "@/lib/accounts/types";

export interface PlatformStatusProps {
  name: string;
  icon: LucideIcon;
  /** The stored account status, or null when no account row exists at all. */
  status: AccountStatus | null;
  /** The connected handle or channel title, when there is one. */
  identity: string | null;
}

/**
 * A publishing platform and its connection state — **read from the stored
 * account record**, never assumed. A platform with no account row reads
 * "Not connected" because that is what the database says, and a connected one
 * shows exactly the identity the OAuth flow stored.
 *
 * Managing connections happens on Connected Accounts, where each permission
 * is explained; this row only reports and links there.
 */
export function PlatformStatus({
  name,
  icon: Icon,
  status,
  identity,
}: PlatformStatusProps) {
  const label =
    status === null ? "Not connected" : ACCOUNT_STATUS_LABELS[status];

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-primary">
            {name}
          </span>
          <span
            className={`block truncate text-xs ${
              status === "connected"
                ? "text-ink-secondary"
                : status === "needs_reconnect"
                  ? "text-gold"
                  : "text-ink-muted"
            }`}
          >
            {label}
            {status === "connected" && identity ? ` · ${identity}` : ""}
          </span>
        </span>
      </span>
      <Link
        href={CONNECTED_ACCOUNTS_PATH}
        className="shrink-0 rounded-md border border-edge-strong/70 px-2.5 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        Manage
        <span className="sr-only"> {name} connection</span>
      </Link>
    </li>
  );
}
