import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

export interface DashboardShellProps {
  /** Section title for the top bar. */
  title: string;
  /** Current path, for active-state marking. */
  pathname: string;
  email: string | null;
  children: React.ReactNode;
}

/**
 * The authenticated application frame: sidebar, top bar, content region.
 *
 * A server component. Only the mobile drawer inside the top bar needs client
 * interactivity, and it opts in on its own.
 */
export function DashboardShell({
  title,
  pathname,
  email,
  children,
}: DashboardShellProps) {
  return (
    <div className="pp-ambient flex min-h-dvh w-full">
      <AppSidebar pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} pathname={pathname} email={email} />

        {/*
          The skip target for keyboard users, and the landmark screen readers
          jump to.
        */}
        <main
          id="main-content"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
