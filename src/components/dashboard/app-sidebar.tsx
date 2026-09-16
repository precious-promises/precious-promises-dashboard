import { BrandMark } from "./brand-mark";
import { ScripturePanel } from "./scripture-panel";
import { SidebarNav } from "./sidebar-nav";

/** Desktop navigation frame shared by every authenticated workspace page. */
export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden h-dvh w-[13.25rem] shrink-0 border-r border-edge/80 bg-[#060a15] lg:sticky lg:top-0 lg:flex lg:flex-col">
      <div className="px-4 py-5">
        <BrandMark />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <SidebarNav pathname={pathname} />
      </div>

      <div className="hidden px-3 pb-3 min-[1400px]:block">
        <ScripturePanel />
      </div>
    </aside>
  );
}
