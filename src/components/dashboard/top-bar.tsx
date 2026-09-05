import { Bell, Search } from "lucide-react";

import { LogoutButton } from "@/app/dashboard/logout-button";

import { MobileSidebar } from "./mobile-sidebar";
import { OwnerBadge } from "./owner-badge";

export interface TopBarProps {
  title: string;
  pathname: string;
  email: string | null;
}

/** Shared premium top bar for all authenticated dashboard pages. */
export function TopBar({ title, pathname, email }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-edge/80 bg-[#080d18]/94 px-4 backdrop-blur-xl sm:px-6 lg:px-7">
      <MobileSidebar pathname={pathname} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-lg font-semibold tracking-tight text-ink-primary">
            {title}
          </h1>
          <span className="hidden text-xs text-ink-muted md:inline">/</span>
          <span className="hidden truncate text-xs text-ink-muted md:inline">
            {title}
          </span>
        </div>
      </div>

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
            className="w-56 cursor-not-allowed rounded-xl border border-edge/80 bg-white/[0.025] py-2 pr-3 pl-9 text-sm text-ink-secondary opacity-75 outline-none placeholder:text-ink-muted xl:w-72"
          />
        </div>

        <button
          type="button"
          disabled
          aria-label="Notifications (unavailable — coming soon)"
          className="inline-flex size-9 cursor-not-allowed items-center justify-center rounded-xl border border-edge/80 bg-white/[0.02] text-ink-muted opacity-75"
        >
          <Bell aria-hidden="true" className="size-4" />
        </button>

        <OwnerBadge email={email} />
        <LogoutButton />
      </div>
    </header>
  );
}
