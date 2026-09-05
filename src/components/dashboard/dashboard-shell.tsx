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
    <div className="pp-ambient flex min-h-dvh w-full bg-[#070b14]">
      <AppSidebar pathname={pathname} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} pathname={pathname} email={email} />

        <main
          id="main-content"
          className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-6 lg:py-6 xl:px-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
