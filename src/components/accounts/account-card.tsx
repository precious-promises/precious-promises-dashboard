import {
  ACCOUNT_STATUS_DETAIL,
  ACCOUNT_STATUS_LABELS,
  accountLabel,
  type SocialAccount,
} from "@/lib/accounts/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { shortScopeName } from "@/lib/youtube/config";

/**
 * One connected account.
 *
 * Renders identity only — a channel name, a handle, a status. There is no
 * token here and there could not be: `SocialAccount` has no field that could
 * hold one, and the table the tokens live in cannot be read from a browser at
 * all.
 *
 * The disconnect control is a plain form posting to a Server Action, so it
 * works without JavaScript and cannot be triggered by a stray click on a link.
 */
export interface AccountCardProps {
  account: SocialAccount;
  disconnectAction: (formData: FormData) => Promise<void>;
}

export function AccountCard({ account, disconnectAction }: AccountCardProps) {
  const tone =
    account.status === "connected"
      ? "configured"
      : account.status === "needs_reconnect"
        ? "accent"
        : "inactive";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-primary">
            {accountLabel(account)}
          </p>
          {account.handle ? (
            <p className="truncate text-xs text-ink-muted">{account.handle}</p>
          ) : null}
          <p className="mt-1 text-xs text-ink-secondary">
            {ACCOUNT_STATUS_DETAIL[account.status]}
          </p>
        </div>
        <StatusBadge tone={tone}>
          {ACCOUNT_STATUS_LABELS[account.status]}
        </StatusBadge>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
        {account.channel_id ? (
          <div className="flex gap-2">
            <dt className="shrink-0">Channel id</dt>
            <dd className="truncate font-mono text-ink-secondary">
              {account.channel_id}
            </dd>
          </div>
        ) : null}
        {account.connected_at ? (
          <div className="flex gap-2">
            <dt className="shrink-0">Connected</dt>
            <dd className="text-ink-secondary">
              {new Date(account.connected_at).toLocaleString("en-GB")}
            </dd>
          </div>
        ) : null}
      </dl>

      {account.granted_scopes.length > 0 ? (
        <div>
          <p className="text-xs text-ink-muted">Permissions granted</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {account.granted_scopes.map((scope) => (
              <li
                key={scope}
                className="rounded border border-edge/70 px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary"
              >
                {shortScopeName(scope)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {account.status !== "disconnected" ? (
        <form action={disconnectAction} className="flex justify-end">
          <input type="hidden" name="account_id" value={account.id} />
          <button
            type="submit"
            className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            Disconnect and revoke
          </button>
        </form>
      ) : null}
    </div>
  );
}
