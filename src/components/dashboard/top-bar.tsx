import { Bell, Search } from "lucide-react";

import { LogoutButton } from "@/app/dashboard/logout-button";

import { MobileSidebar } from "./mobile-sidebar";
import { OwnerBadge } from "./owner-badge";

export interface TopBarProps {
  title: string;
  pathname: string;
  email: string | null;
}

/**
 * The application top bar.
 *
 * Search and notifications are shells for features that do not exist. Both are
 * rendered `disabled` with an explicit "unavailable" in their accessible name,
 * so nobody — sighted or not — is invited to use a control that does nothing.
 */
export function TopBar({ title, pathname, email }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
      <MobileSidebar pathname={pathname} />

      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-ink-primary">
        {title}
      </h1>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden md:block">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <input
            type="search"
            disabled
            placeholder="Search — coming soon"
            aria-label="Search (unavailable — coming soon)"
            className="w-52 cursor-not-allowed rounded-lg border border-edge bg-panel-raised/40 py-2 pr-3 pl-9 text-sm text-ink-secondary opacity-70 placeholder:text-ink-muted lg:w-64"
          />
        </div>

        <button
          type="button"
          disabled
          aria-label="Notifications (unavailable — coming soon)"
          className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-lg border border-edge text-ink-muted opacity-70"
        >
          <Bell aria-hidden="true" className="size-4" />
        </button>

        <div className="mx-1 hidden h-8 w-px bg-edge sm:block" />

        <OwnerBadge email={email} />
        <LogoutButton />
      </div>
    </header>
  );
}
