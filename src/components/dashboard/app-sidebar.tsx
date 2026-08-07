import { BrandMark } from "./brand-mark";
import { ScripturePanel } from "./scripture-panel";
import { SidebarNav } from "./sidebar-nav";

/**
 * The desktop sidebar.
 *
 * Hidden below `lg`, where the mobile drawer takes over. A server component —
 * nothing here is interactive beyond links.
 */
export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-edge bg-panel/60 lg:flex lg:flex-col">
      <div className="border-b border-edge px-5 py-5">
        <BrandMark />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <SidebarNav pathname={pathname} />
      </div>

      <div className="border-t border-edge px-4 py-4">
        <ScripturePanel />
      </div>
    </aside>
  );
}
