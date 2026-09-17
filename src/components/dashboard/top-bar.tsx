import { Search } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { MobileSidebar } from "./mobile-sidebar";
import { OwnerBadge } from "./owner-badge";
export interface TopBarProps {
  title: string;
  pathname: string;
  email: string | null;
}
export function TopBar({ title, pathname, email }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-edge bg-[#080d15] px-3 sm:gap-4 sm:px-5 lg:px-6">
      <MobileSidebar pathname={pathname} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h1>
        <p className="hidden text-[10px] text-ink-muted sm:block">
          <Link href="/dashboard">Workspace</Link> / {title}
        </p>
      </div>
      <form
        action="/dashboard/content"
        role="search"
        aria-label="Search content library"
        className="relative hidden min-w-0 max-w-72 flex-1 md:block"
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          name="q"
          maxLength={120}
          placeholder="Search your content…"
          aria-label="Search content library"
          className="w-full rounded-md border border-edge bg-[#101621] py-2 pr-10 pl-9 text-xs outline-none placeholder:text-ink-muted focus:border-highlight"
        />
        <button
          type="submit"
          aria-label="Search library"
          className="absolute inset-y-0 right-0 px-3 text-xs text-highlight-soft"
        >
          ↵
        </button>
      </form>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <OwnerBadge email={email} />
        <LogoutButton />
      </div>
    </header>
  );
}
