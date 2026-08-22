import { OWNER_INITIALS, OWNER_NAME, OWNER_ROLE } from "@/config/owner";

/**
 * Private owner identity shown only inside the authenticated workspace.
 * Dave's role remains visible at a glance, while the signed-in email stays
 * visible beneath it when available so the account identity remains explicit.
 */
export function OwnerBadge({ email }: { email: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-xs font-semibold tracking-wide text-gold shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
      >
        {OWNER_INITIALS}
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-sm font-medium text-ink-primary">
          {OWNER_NAME}
        </span>
        <span className="block truncate text-xs font-medium text-ink-secondary">
          {OWNER_ROLE}
        </span>
        {email ? (
          <span className="block max-w-48 truncate text-[10px] text-ink-muted">
            {email}
          </span>
        ) : null}
      </span>
    </div>
  );
}
