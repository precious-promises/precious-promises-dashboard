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

/** Routes activated in Stage 2. */
export const CONTENT_LIBRARY_PATH = "/dashboard/content";
export const MEDIA_ASSETS_PATH = "/dashboard/media";

/** Routes activated in Stage 3. */
export const SCRIPTURE_STUDIO_PATH = "/dashboard/scripture";
export const SCRIPT_STUDIO_PATH = "/dashboard/scripts";
export const CAPTION_STUDIO_PATH = "/dashboard/captions";

/** Routes activated in Stage 4. */
export const VIDEO_STUDIO_PATH = "/dashboard/video";

/** Routes activated in Stage 5. */
export const PRODUCTION_BOARD_PATH = "/dashboard/production";
export const APPROVAL_QUEUE_PATH = "/dashboard/approvals";
export const CALENDAR_PATH = "/dashboard/calendar";

/** Routes activated in Stage 6. */
export const PUBLISH_QUEUE_PATH = "/dashboard/publish";

/** Routes activated in Stage 7. */
export const CONNECTED_ACCOUNTS_PATH = "/dashboard/accounts";

/** Routes activated in Stage 8. */
export const DRIVE_BROWSER_PATH = "/dashboard/drive";

/** Routes activated in Stage 10. */
export const ANALYTICS_PATH = "/dashboard/analytics";
export const GROWTH_CENTRE_PATH = "/dashboard/growth";

/** Routes activated in Stage 11. All 19 modules are now genuinely built. */
export const CONTENT_PLANNER_PATH = "/dashboard/planner";
export const YOUTUBE_WORKSPACE_PATH = "/dashboard/youtube";
export const RIGHTS_LICENCES_PATH = "/dashboard/rights";
export const SETTINGS_PATH = "/dashboard/settings";

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
        status: "available",
        href: PRODUCTION_BOARD_PATH,
      },
      {
        id: "content-library",
        label: "Content Library",
        icon: Library,
        status: "available",
        href: CONTENT_LIBRARY_PATH,
      },
      {
        id: "content-planner",
        label: "Content Planner",
        icon: CalendarClock,
        status: "available",
        href: CONTENT_PLANNER_PATH,
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
        status: "available",
        href: SCRIPTURE_STUDIO_PATH,
      },
      {
        id: "script-studio",
        label: "Script Studio",
        icon: FileText,
        status: "available",
        href: SCRIPT_STUDIO_PATH,
      },
      {
        id: "caption-studio",
        label: "Caption Studio",
        icon: MessageSquareQuote,
        status: "available",
        href: CAPTION_STUDIO_PATH,
      },
      {
        id: "video-creation-studio",
        label: "Video Creation Studio",
        icon: Clapperboard,
        status: "available",
        href: VIDEO_STUDIO_PATH,
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
        status: "available",
        href: MEDIA_ASSETS_PATH,
      },
      {
        id: "google-drive-browser",
        label: "Google Drive Browser",
        icon: FolderOpen,
        status: "available",
        href: DRIVE_BROWSER_PATH,
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
        status: "available",
        href: CALENDAR_PATH,
      },
      {
        id: "approval-queue",
        label: "Approval Queue",
        icon: CheckSquare,
        status: "available",
        href: APPROVAL_QUEUE_PATH,
      },
      {
        id: "publish-queue",
        label: "Publish Queue",
        icon: Send,
        status: "available",
        href: PUBLISH_QUEUE_PATH,
      },
      {
        id: "youtube-playlists",
        label: "YouTube & Playlists",
        icon: ListVideo,
        status: "available",
        href: YOUTUBE_WORKSPACE_PATH,
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
        status: "available",
        href: GROWTH_CENTRE_PATH,
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: TrendingUp,
        status: "available",
        href: ANALYTICS_PATH,
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
        status: "available",
        href: CONNECTED_ACCOUNTS_PATH,
      },
      {
        id: "rights-licences",
        label: "Rights & Licences",
        icon: Scale,
        status: "available",
        href: RIGHTS_LICENCES_PATH,
      },
      {
        id: "settings",
        label: "Settings",
        icon: Settings,
        status: "available",
        href: SETTINGS_PATH,
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
