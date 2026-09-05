import { BrandMark } from "./brand-mark";
import { ScripturePanel } from "./scripture-panel";
import { SidebarNav } from "./sidebar-nav";

/** Desktop navigation frame shared by every authenticated workspace page. */
export function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="hidden h-dvh w-[15.5rem] shrink-0 border-r border-edge/80 bg-[#060a15] lg:sticky lg:top-0 lg:flex lg:flex-col">
      <div className="px-5 pt-5 pb-4">
        <BrandMark />
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <SidebarNav pathname={pathname} />
      </div>

      <div className="px-3 pb-4">
        <ScripturePanel />
      </div>
    </aside>
  );
}
