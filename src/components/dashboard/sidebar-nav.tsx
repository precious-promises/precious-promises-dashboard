import Link from "next/link";

import { NAVIGATION, type NavItem } from "@/config/navigation";
import { DASHBOARD_PATH } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  /** Current path, used to mark the active item. */
  pathname: string;
  /** Called when a link is followed — lets the mobile drawer close itself. */
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

  // An unbuilt module is not a link. Rendering it as a plain, non-focusable
  // row means it cannot be clicked, tabbed to, or opened in a new tab — there
  // is no route behind it to reach.
  if (item.status === "coming-soon" || item.href === undefined) {
    return (
      <li>
        <span
          aria-disabled="true"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted/70"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="sr-only">(coming soon)</span>
          <span
            aria-hidden="true"
            className="shrink-0 text-[10px] font-medium tracking-wide text-ink-muted/60"
          >
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
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight",
          isActive
            ? "bg-highlight/15 text-ink-primary shadow-[inset_2px_0_0_0_var(--color-highlight)]"
            : "text-ink-secondary hover:bg-panel-hover/60 hover:text-ink-primary",
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            isActive ? "text-highlight" : "text-ink-muted",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </Link>
    </li>
  );
}

/**
 * Whether a nav item covers the current path.
 *
 * A prefix match so `/dashboard/content/new` still highlights Content Library,
 * with a boundary check so `/dashboard/media` never lights up an item pointing
 * at `/dashboard/me`.
 *
 * `/dashboard` is matched exactly — as a prefix it would own every page.
 */
function isActiveFor(href: string, pathname: string): boolean {
  if (href === DASHBOARD_PATH) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The navigation list itself, shared by the desktop sidebar and the mobile
 * drawer so the two can never drift apart.
 */
export function SidebarNav({ pathname, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Dashboard sections" className="flex flex-col gap-5">
      {NAVIGATION.map((group, index) => (
        <div key={group.label ?? `group-${index}`}>
          {group.label ? (
            <h3 className="px-3 pb-2 text-[10px] font-semibold tracking-[0.12em] text-ink-muted/70 uppercase">
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
