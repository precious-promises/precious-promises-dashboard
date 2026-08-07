import {
  CalendarClock,
  CheckSquare,
  Clapperboard,
  FileText,
  Camera,
  Music2,
  Send,
  ScrollText,
  Library,
  Images,
  MonitorPlay,
  MessageSquareQuote,
} from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PlatformStatus } from "@/components/dashboard/platform-status";
import {
  QuickAction,
  QuickActionLink,
} from "@/components/dashboard/quick-action";
import { WorkflowPipeline } from "@/components/dashboard/workflow-pipeline";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { OWNER_NAME } from "@/config/owner";
import { DASHBOARD_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import {
  countScriptureNeedingAttention,
  getContentCounts,
} from "@/lib/content/repository";
import { countItemsWithScripts } from "@/lib/scripts/repository";
import { greetingFor } from "@/lib/greeting";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Dashboard metrics.
 *
 * The first two are **real queries** against `content_items` as of Stage 2 —
 * often still zero, but now because the database says so rather than because
 * the number was written into the markup.
 *
 * The last two stay at zero and say why: scheduling and publishing do not
 * exist, so there is nothing to count. Showing anything else would imply a
 * capability the product does not have.
 */
function buildMetrics(counts: {
  draft: number;
  readyForReview: number;
  scriptureNeedingAttention: number;
  itemsWithScripts: number;
}) {
  return [
    {
      label: "Drafts",
      value: counts.draft,
      icon: FileText,
      note: "In progress in the library",
    },
    {
      label: "Ready for Review",
      value: counts.readyForReview,
      icon: CheckSquare,
      note: "Marked ready by you",
    },
    {
      label: "Scripture to Verify",
      value: counts.scriptureNeedingAttention,
      icon: ScrollText,
      note: "Unverified or needing re-verification",
    },
    {
      label: "Scripts In Progress",
      value: counts.itemsWithScripts,
      icon: Clapperboard,
      note: "Items with at least one revision",
    },
    {
      label: "Scheduled",
      value: 0,
      icon: CalendarClock,
      note: "Scheduling not built",
    },
    {
      label: "Published This Week",
      value: 0,
      icon: Send,
      note: "Publishing not connected",
    },
  ] as const;
}

/** Actions that still have nothing behind them. */
const QUICK_ACTIONS = [
  {
    label: "Create Video",
    description: "Assemble and render a video",
    icon: Clapperboard,
  },
  {
    label: "Schedule Post",
    description: "Queue approved content",
    icon: CalendarClock,
  },
] as const;

const PLATFORMS = [
  { name: "YouTube", icon: MonitorPlay },
  { name: "Instagram", icon: Camera },
  { name: "TikTok", icon: Music2 },
] as const;

/**
 * What the application genuinely has, described structurally.
 *
 * These say what is *configured in this codebase* — they deliberately do not
 * claim any external service is currently reachable. Nothing here performs a
 * health check, so nothing here should read like one.
 */
const FOUNDATION = [
  { label: "Authentication foundation", state: "Configured" },
  { label: "Database connection", state: "Configured" },
  { label: "Profiles RLS", state: "Configured" },
  { label: "Content library RLS", state: "Configured" },
  { label: "Script & variant RLS", state: "Configured" },
  { label: "Media storage", state: "Not configured" },
  { label: "Publishing", state: "Not configured" },
] as const;

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const [counts, scriptureNeedingAttention, itemsWithScripts] =
    await Promise.all([
      getContentCounts(),
      countScriptureNeedingAttention(),
      countItemsWithScripts(),
    ]);
  const metrics = buildMetrics({
    ...counts,
    scriptureNeedingAttention,
    itemsWithScripts,
  });
  const greeting = greetingFor(new Date().getHours(), OWNER_NAME);

  return (
    <DashboardShell
      title="Dashboard"
      pathname={DASHBOARD_PATH}
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            {greeting}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Manage your Precious Promises content, production and growth from
            one place.
          </p>
        </div>

        <section aria-label="Overview">
          <h3 className="sr-only">Today</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard
            title="Upcoming content"
            className="xl:col-span-2"
            action={<StatusBadge>Coming soon</StatusBadge>}
          >
            <EmptyState
              icon={CalendarClock}
              title="No content scheduled yet."
              description="Your approved publishing schedule will appear here once the content workflow is connected."
              action={
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-lg border border-edge-strong/70 px-4 py-2 text-sm font-medium text-ink-muted opacity-70"
                >
                  View Calendar
                  <span className="sr-only"> — coming soon</span>
                </button>
              }
            />
          </SectionCard>

          <SectionCard
            title="Connected platforms"
            description="No publishing integration exists yet."
          >
            <ul className="flex flex-col gap-2.5">
              {PLATFORMS.map((platform) => (
                <PlatformStatus key={platform.name} {...platform} />
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          title="Production pipeline"
          description="The approved content workflow."
        >
          <WorkflowPipeline />
        </SectionCard>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard title="Quick actions" className="xl:col-span-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickActionLink
                href="/dashboard/content/new"
                label="Create Content"
                description="Start a new content item"
                icon={FileText}
              />
              <QuickActionLink
                href="/dashboard/content"
                label="Content Library"
                description="Browse and filter your content"
                icon={Library}
              />
              <QuickActionLink
                href="/dashboard/scripture"
                label="Scripture Studio"
                description="Review and verify Scripture"
                icon={ScrollText}
              />
              <QuickActionLink
                href="/dashboard/scripts"
                label="Script Studio"
                description="Write and revise scripts"
                icon={Clapperboard}
              />
              <QuickActionLink
                href="/dashboard/captions"
                label="Caption Studio"
                description="Write per-platform captions"
                icon={MessageSquareQuote}
              />
              <QuickActionLink
                href="/dashboard/media"
                label="Media Assets"
                description="Review media metadata"
                icon={Images}
              />
              {QUICK_ACTIONS.map((action) => (
                <QuickAction key={action.label} {...action} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="System foundation"
            description="What is configured in this application."
          >
            <ul className="flex flex-col gap-2.5">
              {FOUNDATION.map((entry) => (
                <li
                  key={entry.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-ink-secondary">
                    {entry.label}
                  </span>
                  <StatusBadge
                    tone={
                      entry.state === "Configured" ? "configured" : "inactive"
                    }
                  >
                    {entry.state}
                  </StatusBadge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              These describe configuration in this codebase. They are not live
              service health checks.
            </p>
          </SectionCard>
        </div>
      </div>
    </DashboardShell>
  );
}
