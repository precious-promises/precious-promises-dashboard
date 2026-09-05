import { ChevronDown } from "lucide-react";

import { OWNER_INITIALS, OWNER_NAME, OWNER_ROLE } from "@/config/owner";

/** Private owner identity shown only inside the authenticated workspace. */
export function OwnerBadge({ email }: { email: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#9d68ff]/35 bg-gradient-to-br from-[#5520bd] to-[#7a2ee7] text-xs font-semibold tracking-wide text-white shadow-[0_8px_24px_rgba(74,29,151,0.28)]"
      >
        {OWNER_INITIALS}
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block truncate text-[13px] font-semibold text-ink-primary">
          {OWNER_NAME}
        </span>
        <span className="block truncate text-[11px] text-ink-muted">
          {OWNER_ROLE}
        </span>
        {email ? <span className="sr-only">{email}</span> : null}
      </span>
      <ChevronDown
        aria-hidden="true"
        className="hidden size-3.5 shrink-0 text-ink-muted md:block"
      />
    </div>
  );
}
