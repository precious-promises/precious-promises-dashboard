import { OWNER_INITIALS, OWNER_NAME, OWNER_ROLE } from "@/config/owner";

/**
 * The owner identity control in the top bar.
 *
 * This appears only inside the authenticated shell. Dave's name and role are
 * private workspace attribution and must never render on a public page.
 *
 * The avatar is initials, deliberately — no stock photography, and no invented
 * person.
 */
export function OwnerBadge({ email }: { email: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-dim/40 bg-gradient-to-br from-panel-raised to-panel text-xs font-semibold tracking-wide text-gold"
      >
        {OWNER_INITIALS}
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-sm font-medium text-ink-primary">
          {OWNER_NAME}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {email ?? OWNER_ROLE}
        </span>
      </span>
    </div>
  );
}
