import {
  Calendar,
  CalendarClock,
  CheckSquare,
  Clapperboard,
  FileText,
  FolderOpen,
  Gauge,
  Images,
  LayoutDashboard,
  Library,
  MessageSquareQuote,
  ScrollText,
  Send,
  Settings,
  Scale,
  Sparkles,
  TrendingUp,
  ListVideo,
  Link2,
  type LucideIcon,
} from "lucide-react";

import { DASHBOARD_PATH } from "@/lib/auth/routes";

/**
 * The dashboard's navigation, defined once.
 *
 * Availability is data, not styling. An item is either `available` — in which
 * case it has an `href` and renders as a link — or `coming-soon`, in which case
 * it has no `href` at all and cannot be navigated to.
 *
 * That distinction is deliberate and load-bearing: it makes it impossible to
 * link to a route that does not exist. A future module becomes reachable by
 * gaining an `href` and flipping its status, and not before.
 */
export type NavStatus = "available" | "coming-soon";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Present only when `status` is `available`. */
  href?: string;
}

export interface NavGroup {
  /** Group heading; `null` for the ungrouped items at the top. */
  label: string | null;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        status: "available",
        href: DASHBOARD_PATH,
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        id: "production-board",
        label: "Production Board",
        icon: Gauge,
        status: "coming-soon",
      },
      {
        id: "content-library",
        label: "Content Library",
        icon: Library,
        status: "coming-soon",
      },
      {
        id: "content-planner",
        label: "Content Planner",
        icon: CalendarClock,
        status: "coming-soon",
      },
    ],
  },
  {
    label: "Create",
    items: [
      {
        id: "scripture-studio",
        label: "Scripture Studio",
        icon: ScrollText,
        status: "coming-soon",
      },
      {
        id: "script-studio",
        label: "Script Studio",
        icon: FileText,
        status: "coming-soon",
      },
      {
        id: "caption-studio",
        label: "Caption Studio",
        icon: MessageSquareQuote,
        status: "coming-soon",
      },
      {
        id: "video-creation-studio",
        label: "Video Creation Studio",
        icon: Clapperboard,
        status: "coming-soon",
      },
    ],
  },
  {
    label: "Media",
    items: [
      {
        id: "media-assets",
        label: "Media Assets",
        icon: Images,
        status: "coming-soon",
      },
      {
        id: "google-drive-browser",
        label: "Google Drive Browser",
        icon: FolderOpen,
        status: "coming-soon",
      },
    ],
  },
  {
    label: "Publish",
    items: [
      {
        id: "calendar",
        label: "Calendar",
        icon: Calendar,
        status: "coming-soon",
      },
      {
        id: "approval-queue",
        label: "Approval Queue",
        icon: CheckSquare,
        status: "coming-soon",
      },
      {
        id: "publish-queue",
        label: "Publish Queue",
        icon: Send,
        status: "coming-soon",
      },
      {
        id: "youtube-playlists",
        label: "YouTube & Playlists",
        icon: ListVideo,
        status: "coming-soon",
      },
    ],
  },
  {
    label: "Grow",
    items: [
      {
        id: "growth-centre",
        label: "Growth Centre",
        icon: Sparkles,
        status: "coming-soon",
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: TrendingUp,
        status: "coming-soon",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        id: "connected-accounts",
        label: "Connected Accounts",
        icon: Link2,
        status: "coming-soon",
      },
      {
        id: "rights-licences",
        label: "Rights & Licences",
        icon: Scale,
        status: "coming-soon",
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        status: "coming-soon",
      },
    ],
  },
];

/** Every item, flattened. */
export function allNavItems(): NavItem[] {
  return NAVIGATION.flatMap((group) => group.items);
}

/** The title shown in the top bar for a given path. */
export function sectionTitleForPath(pathname: string): string {
  const match = allNavItems().find(
    (item) => item.href !== undefined && item.href === pathname,
  );
  return match?.label ?? "Dashboard";
}
