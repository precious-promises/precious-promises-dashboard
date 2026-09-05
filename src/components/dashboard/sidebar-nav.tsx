import Link from "next/link";

import { NAVIGATION, type NavItem } from "@/config/navigation";
import { DASHBOARD_PATH } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  pathname: string;
  onNavigate?: () => void;
}

function NavRow({
  item,
  isActive,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  if (item.status === "coming-soon" || item.href === undefined) {
    return (
      <li>
        <span
          aria-disabled="true"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-ink-muted/65"
        >
          <Icon aria-hidden="true" className="size-[17px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="sr-only">(coming soon)</span>
          <span aria-hidden="true" className="text-[9px] font-semibold tracking-wider">
            SOON
          </span>
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight",
          isActive
            ? "bg-gradient-to-r from-[#6928d9] to-[#7b2ce8] text-white shadow-[0_10px_26px_rgba(92,35,197,0.28)]"
            : "text-ink-secondary hover:bg-white/[0.045] hover:text-ink-primary",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            "size-[17px] shrink-0 transition-colors",
            isActive ? "text-white" : "text-ink-muted group-hover:text-ink-secondary",
          )}
          strokeWidth={1.8}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

function isActiveFor(href: string, pathname: string): boolean {
  if (href === DASHBOARD_PATH) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ pathname, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Dashboard sections" className="flex flex-col gap-4">
      {NAVIGATION.map((group, index) => (
        <div key={group.label ?? `group-${index}`}>
          {group.label ? (
            <h3 className="px-3 pb-1.5 text-[9px] font-semibold tracking-[0.16em] text-ink-muted/55 uppercase">
              {group.label}
            </h3>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                isActive={
                  item.href !== undefined && isActiveFor(item.href, pathname)
                }
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
