import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckSquare,
  Clapperboard,
  Gauge,
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
import Link from "next/link";
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
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import {
  describeFreshness,
  formatReading,
  METRIC_LABELS,
  UNAVAILABLE_LABELS,
  type MetricName,
} from "@/lib/analytics/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { OWNER_NAME } from "@/config/owner";
import { DASHBOARD_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import {
  countScriptureNeedingAttention,
  getContentCounts,
} from "@/lib/content/repository";
import { loadReviewRows } from "@/lib/approvals/repository";
import { loadBoard } from "@/lib/production/board";
import type { ProductionStage } from "@/lib/production/stage";
import {
  listScheduleEntries,
  upcomingEntries,
} from "@/lib/schedule/repository";
import { formatInTimeZone } from "@/lib/schedule/timezone";
import { countItemsWithScripts } from "@/lib/scripts/repository";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import { countVideoProjects } from "@/lib/video/repository";
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
  videoProjects: number;
  awaitingApproval: number;
  approved: number;
  scheduled: number;
  queued: number;
  publishFailed: number;
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
      label: "Video Projects",
      value: counts.videoProjects,
      icon: MonitorPlay,
      note: "Compositions in the video studio",
    },
    {
      label: "Awaiting Approval",
      value: counts.awaitingApproval,
      icon: CheckSquare,
      note: "Variants marked ready for review",
    },
    {
      label: "Approved",
      value: counts.approved,
      icon: Check,
      note: "Approvals that still match their content",
    },
    {
      label: "Scheduled",
      value: counts.scheduled,
      icon: CalendarClock,
      note: "Times set, waiting for the dispatcher",
    },
    {
      label: "Queued",
      value: counts.queued,
      icon: Send,
      note: "Claimed by the worker",
    },
    {
      label: "Publish Failures",
      value: counts.publishFailed,
      icon: AlertTriangle,
      note: "Stopped, with the reason recorded",
    },
    {
      label: "Published This Week",
      value: 0,
      icon: Send,
      note: "No platform is connected",
    },
  ] as const;
}

/** Actions that still have nothing behind them. */
const QUICK_ACTIONS = [
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
  { label: "Video studio RLS", state: "Configured" },
  { label: "Approval & schedule RLS", state: "Configured" },
  { label: "Audit log", state: "Configured" },
  { label: "Publishing infrastructure", state: "Configured" },
  { label: "Platform connections", state: "Not configured" },
  { label: "Media storage", state: "Not configured" },
  { label: "Video rendering", state: "Not configured" },
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

  const [
    counts,
    scriptureNeedingAttention,
    itemsWithScripts,
    videoProjects,
    reviewRows,
    scheduleEntries,
    board,
  ] = await Promise.all([
    getContentCounts(),
    countScriptureNeedingAttention(),
    countItemsWithScripts(),
    countVideoProjects(),
    loadReviewRows(),
    listScheduleEntries(),
    loadBoard(),
  ]);

  const now = new Date();
  const upcoming = upcomingEntries(scheduleEntries, now, 5);

  // Real observations only. There is no sample data anywhere on this page.
  const analytics = await loadAnalyticsOverview();

  // Stage counts for the pipeline, derived rather than stored.
  const stageCounts: Partial<Record<ProductionStage, number>> = {};
  for (const card of board) {
    stageCounts[card.stage] = (stageCounts[card.stage] ?? 0) + 1;
  }

  const metrics = buildMetrics({
    ...counts,
    scriptureNeedingAttention,
    itemsWithScripts,
    videoProjects,
    awaitingApproval: reviewRows.filter(
      (row) => row.variant.review_state === "ready_for_review",
    ).length,
    // Only approvals that still match their content. An approval whose
    // fingerprint has moved on has already been withdrawn.
    approved: reviewRows.filter((row) => row.validity === "valid").length,
    scheduled: scheduleEntries.filter(
      (entry) => entry.post.status === "scheduled",
    ).length,
    queued: scheduleEntries.filter(
      (entry) =>
        entry.post.status === "queued" || entry.post.status === "publishing",
    ).length,
    publishFailed: scheduleEntries.filter(
      (entry) => entry.post.status === "failed",
    ).length,
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </section>

        <SectionCard
          title="Performance"
          description="Measured figures only. Where nothing has been measured, this says so rather than showing a zero."
          action={
            <Link
              href="/dashboard/analytics"
              className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Open Analytics
            </Link>
          }
        >
          {analytics.publishedCount === 0 ? (
            <p className="text-sm leading-6 text-ink-secondary">
              Nothing has been published yet, so there is nothing to measure.
              Once a post genuinely goes out and analytics permission is
              granted, its figures will appear here — measured, dated and
              attributed.
            </p>
          ) : (
            <>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
                  <dt className="text-xs text-ink-muted">Posts published</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                    {analytics.publishedCount}
                  </dd>
                </div>

                {(
                  [
                    "views_or_plays",
                    "watch_time_seconds",
                    "engagements",
                  ] as MetricName[]
                ).map((metric) => {
                  const value = analytics.totals[metric];
                  return (
                    <div
                      key={metric}
                      className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3"
                    >
                      <dt className="text-xs text-ink-muted">
                        {METRIC_LABELS[metric]}
                      </dt>
                      <dd
                        className={`mt-1 text-xl font-semibold tabular-nums ${
                          value?.available
                            ? "text-ink-primary"
                            : "text-ink-muted"
                        }`}
                      >
                        {value ? formatReading(value) : "—"}
                      </dd>
                      {value && !value.available ? (
                        <dd className="mt-0.5 text-[11px] text-gold">
                          {UNAVAILABLE_LABELS[value.reason]}
                        </dd>
                      ) : null}
                    </div>
                  );
                })}
              </dl>

              <p className="mt-3 text-xs leading-5 text-ink-muted">
                {analytics.measuredCount} of {analytics.publishedCount}{" "}
                published{" "}
                {analytics.publishedCount === 1 ? "post has" : "posts have"}{" "}
                been measured. Last fetched{" "}
                {describeFreshness(analytics.lastFetchedAt).toLowerCase()}.
              </p>
            </>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard
            title="Upcoming content"
            description="Approved variants with a time against them. Nothing sends them."
            className="xl:col-span-2"
          >
            {upcoming.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled yet."
                description="Approve a platform variant, then give it a time in the Calendar. Scheduling records an intention — no publishing integration exists."
                action={
                  <Link
                    href="/dashboard/calendar"
                    className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    Open Calendar
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((entry) => (
                  <li key={entry.post.id}>
                    <Link
                      href={`/dashboard/calendar?entry=${entry.post.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5 transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-primary">
                          {entry.item.title}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {PLATFORM_LABELS[entry.variant.platform]} ·{" "}
                          {formatInTimeZone(
                            new Date(entry.post.scheduled_for),
                            entry.post.timezone,
                          )}
                        </span>
                      </span>
                      <StatusBadge tone="inactive">Scheduled</StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
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
          description="Where the work actually is, derived from the records."
        >
          <WorkflowPipeline counts={stageCounts} />
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
                href="/dashboard/video"
                label="Video Creation Studio"
                description="Build a video composition"
                icon={MonitorPlay}
              />
              <QuickActionLink
                href="/dashboard/approvals"
                label="Approval Queue"
                description="Review and approve per platform"
                icon={CheckSquare}
              />
              <QuickActionLink
                href="/dashboard/production"
                label="Production Board"
                description="See where every item is"
                icon={Gauge}
              />
              <QuickActionLink
                href="/dashboard/calendar"
                label="Calendar"
                description="Give approved content a time"
                icon={CalendarClock}
              />
              <QuickActionLink
                href="/dashboard/publish"
                label="Publish Queue"
                description="Claims, attempts and outcomes"
                icon={Send}
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
