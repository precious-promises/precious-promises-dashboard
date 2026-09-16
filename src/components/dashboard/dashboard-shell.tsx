import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

export interface DashboardShellProps {
  title: string;
  pathname: string;
  email: string | null;
  children: React.ReactNode;
}

/** Shared authenticated application frame. */
export function DashboardShell({
  title,
  pathname,
  email,
  children,
}: DashboardShellProps) {
  return (
    <div className="pp-workspace flex min-h-dvh w-full bg-[#080d15]">
      <AppSidebar pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} pathname={pathname} email={email} />

        <main
          id="main-content"
          className="min-w-0 flex-1 px-3 py-3 sm:px-5 sm:py-4 lg:px-5 xl:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
