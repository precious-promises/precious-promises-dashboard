import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarClock,
  Captions,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clapperboard,
  FileText,
  Gauge,
  Images,
  Library,
  Mic2,
  MonitorPlay,
  Music2,
  ScrollText,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PlatformStatus } from "@/components/dashboard/platform-status";
import { QuickActionLink } from "@/components/dashboard/quick-action";
import { WorkflowPipeline } from "@/components/dashboard/workflow-pipeline";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { OWNER_NAME } from "@/config/owner";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import {
  describeFreshness,
  formatReading,
  METRIC_LABELS,
  UNAVAILABLE_LABELS,
  type MetricName,
} from "@/lib/analytics/types";
import { isAiConfigured } from "@/lib/ai/server-config";
import { loadReviewRows } from "@/lib/approvals/repository";
import { DASHBOARD_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import {
  countScriptureNeedingAttention,
  getContentCounts,
  listContentItems,
} from "@/lib/content/repository";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
} from "@/lib/content/types";
import { greetingFor } from "@/lib/greeting";
import { loadBoard } from "@/lib/production/board";
import type { ProductionStage } from "@/lib/production/stage";
import { isRenderConfigured } from "@/lib/render/server-config";
import {
  listScheduleEntries,
  upcomingEntries,
} from "@/lib/schedule/repository";
import { formatInTimeZone } from "@/lib/schedule/timezone";
import { countItemsWithScripts } from "@/lib/scripts/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import {
  countVideoProjects,
  listScenes,
  listVideoProjects,
} from "@/lib/video/repository";
import {
  VIDEO_PROJECT_STATUS_LABELS,
  type VideoScene,
} from "@/lib/video/types";
import { isElevenLabsConfigured } from "@/lib/voice/server-config";
import { analyticsSchedulingConnected } from "@/trigger/analytics";

export const metadata: Metadata = {
  title: "Dashboard · Precious Promises",
  robots: { index: false, follow: false },
};

const PLATFORMS = [
  { name: "YouTube", platform: "youtube", icon: MonitorPlay },
  { name: "Instagram", platform: "instagram", icon: Images },
  { name: "TikTok", platform: "tiktok", icon: Music2 },
] as const;

function sameScheduleDay(date: Date, timezone: string, comparison: Date) {
  const key = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  return key(date) === key(comparison);
}

function formatUpdated(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MiniMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-edge/80 bg-panel-raised/45 px-4 py-3.5 shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

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
    videoProjectsCount,
    reviewRows,
    scheduleEntries,
    board,
    socialAccounts,
    recentItems,
    videoProjects,
  ] = await Promise.all([
    getContentCounts(),
    countScriptureNeedingAttention(),
    countItemsWithScripts(),
    countVideoProjects(),
    loadReviewRows(),
    listScheduleEntries(),
    loadBoard(),
    loadSocialAccounts(),
    listContentItems({}),
    listVideoProjects(),
  ]);

  const analytics = await loadAnalyticsOverview();
  const now = new Date();
  const upcoming = upcomingEntries(scheduleEntries, now, 6);
  const todayEntries = scheduleEntries
    .filter((entry) =>
      sameScheduleDay(
        new Date(entry.post.scheduled_for),
        entry.post.timezone,
        now,
      ),
    )
    .slice(0, 5);
  const approvalQueue = reviewRows
    .filter((row) => row.variant.review_state === "ready_for_review")
    .slice(0, 5);
  const latestContent = recentItems[0] ?? null;
  const latestVideo =
    videoProjects.find((project) => project.status !== "archived") ?? null;
  const latestScenes: VideoScene[] = latestVideo
    ? await listScenes(latestVideo.id)
    : [];

  const stageCounts: Partial<Record<ProductionStage, number>> = {};
  for (const card of board) {
    stageCounts[card.stage] = (stageCounts[card.stage] ?? 0) + 1;
  }

  const approved = reviewRows.filter((row) => row.validity === "valid").length;
  const scheduled = scheduleEntries.filter(
    (entry) => entry.post.status === "scheduled",
  ).length;
  const postedThisWeek = scheduleEntries.filter(
    (entry) =>
      entry.post.status === "posted" &&
      entry.post.posted_at !== null &&
      now.getTime() - new Date(entry.post.posted_at).getTime() <
        7 * 24 * 60 * 60 * 1000,
  ).length;
  const publishFailures = scheduleEntries.filter(
    (entry) => entry.post.status === "failed",
  ).length;

  const readiness = [
    {
      label: "Render worker",
      ready: isRenderConfigured() && isWorkerConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "ElevenLabs",
      ready: isElevenLabsConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "AI drafting",
      ready: isAiConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "Scheduled jobs",
      ready: analyticsSchedulingConnected(),
      readyLabel: "Connected",
      offLabel: "Not connected",
    },
  ];

  const greeting = greetingFor(new Date().getHours(), OWNER_NAME);

  return (
    <DashboardShell
      title="Dashboard"
      pathname={DASHBOARD_PATH}
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
        <section className="relative overflow-hidden rounded-2xl border border-edge bg-panel/78 px-5 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-6 lg:px-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(77,141,247,0.12),transparent_36%),radial-gradient(circle_at_92%_12%,rgba(201,169,97,0.09),transparent_30%)]"
          />
          <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Precious Promises Command Centre
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl lg:text-4xl">
                {greeting}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                Your content, approvals, production, scheduling and performance
                in one premium workspace. Every figure below comes from stored
                records; unavailable services stay clearly marked unavailable.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[560px]">
              <MiniMetric
                label="Content"
                value={counts.total}
                note="Stored items"
              />
              <MiniMetric
                label="Approvals"
                value={approvalQueue.length}
                note="Waiting now"
              />
              <MiniMetric
                label="Scheduled"
                value={scheduled}
                note="Future posts"
              />
              <MiniMetric
                label="Published"
                value={postedThisWeek}
                note="Last 7 days"
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1.18fr_0.82fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <SectionCard
                title="Today’s Schedule"
                description="What is genuinely scheduled for today, in each post’s stored timezone."
                action={
                  <Link
                    href="/dashboard/calendar"
                    className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                  >
                    Open calendar
                  </Link>
                }
              >
                {todayEntries.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="Nothing scheduled today."
                    description="There are no stored scheduled posts for today."
                  />
                ) : (
                  <ul className="space-y-2">
                    {todayEntries.map((entry) => (
                      <li key={entry.post.id}>
                        <Link
                          href={`/dashboard/calendar?entry=${entry.post.id}`}
                          className="group flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-raised/35 px-3.5 py-3 transition hover:border-edge-strong hover:bg-panel-hover/55"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-highlight/20 bg-highlight/10 text-highlight-soft">
                            <CalendarClock
                              aria-hidden="true"
                              className="size-4"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-primary">
                              {entry.item.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {PLATFORM_LABELS[entry.variant.platform]} ·{" "}
                              {formatInTimeZone(
                                new Date(entry.post.scheduled_for),
                                entry.post.timezone,
                              )}
                            </span>
                          </span>
                          <ChevronRight
                            aria-hidden="true"
                            className="size-4 text-ink-muted group-hover:text-ink-primary"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="Content Calendar"
                description="The next approved items with real stored schedule times."
                action={
                  <Link
                    href="/dashboard/calendar"
                    className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                  >
                    View full calendar
                  </Link>
                }
              >
                {upcoming.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="Calendar is clear."
                    description="Approve a platform variant and assign a time to make it appear here."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {upcoming.map((entry) => (
                      <Link
                        key={entry.post.id}
                        href={`/dashboard/calendar?entry=${entry.post.id}`}
                        className="rounded-xl border border-edge/70 bg-panel-raised/35 p-3.5 transition hover:border-edge-strong hover:bg-panel-hover/55"
                      >
                        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
                          {PLATFORM_LABELS[entry.variant.platform]}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-sm font-medium text-ink-primary">
                          {entry.item.title}
                        </span>
                        <span className="mt-2 block text-xs text-ink-muted">
                          {formatInTimeZone(
                            new Date(entry.post.scheduled_for),
                            entry.post.timezone,
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Approval Queue"
              description="Platform variants genuinely waiting for your decision. AI never approves them."
              action={
                <Link
                  href="/dashboard/approvals"
                  className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                >
                  Open approval queue
                </Link>
              }
            >
              {approvalQueue.length === 0 ? (
                <EmptyState
                  icon={CheckSquare}
                  title="Nothing is waiting for approval."
                  description="Items marked ready for review will appear here."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-edge/70">
                  <ul className="divide-y divide-edge/70">
                    {approvalQueue.map((row) => (
                      <li key={row.variant.id}>
                        <Link
                          href={`/dashboard/approvals?variant=${row.variant.id}`}
                          className="flex flex-col gap-2 bg-panel-raised/25 px-4 py-3.5 transition hover:bg-panel-hover/55 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink-primary">
                              {row.item.title}
                            </span>
                            <span className="block text-xs text-ink-muted">
                              {PLATFORM_LABELS[row.variant.platform]} ·{" "}
                              {row.blockers.length === 0
                                ? "Ready for your decision"
                                : `${row.blockers.length} blocker${row.blockers.length === 1 ? "" : "s"}`}
                            </span>
                          </span>
                          <StatusBadge
                            tone={
                              row.blockers.length === 0 ? "accent" : "inactive"
                            }
                          >
                            {row.blockers.length === 0 ? "Review" : "Blocked"}
                          </StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <SectionCard
                title="Recent Content"
                description="Your most recently updated real content records."
                action={
                  <Link
                    href="/dashboard/content"
                    className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                  >
                    Open library
                  </Link>
                }
              >
                {recentItems.length === 0 ? (
                  <EmptyState
                    icon={Library}
                    title="No content yet."
                    description="Create the first content item to start the workflow."
                  />
                ) : (
                  <ul className="space-y-2">
                    {recentItems.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/dashboard/content/${item.id}`}
                          className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-raised/30 px-3.5 py-3 transition hover:border-edge-strong hover:bg-panel-hover/55"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-panel text-ink-muted">
                            <FileText aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-primary">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-ink-muted">
                              {CONTENT_TYPE_LABELS[item.content_type]} ·{" "}
                              {formatUpdated(item.updated_at)}
                            </span>
                          </span>
                          <StatusBadge
                            tone={
                              item.status === "ready_for_review"
                                ? "accent"
                                : "inactive"
                            }
                          >
                            {CONTENT_STATUS_LABELS[item.status]}
                          </StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="Performance Snapshot"
                description="Measured platform data only — never invented zeros."
                action={
                  <Link
                    href="/dashboard/analytics"
                    className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                  >
                    Open analytics
                  </Link>
                }
              >
                {analytics.publishedCount === 0 ? (
                  <EmptyState
                    icon={BarChart3}
                    title="No measured performance yet."
                    description="Nothing has been published and measured through a connected analytics source yet."
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <MiniMetric
                        label="Published"
                        value={analytics.publishedCount}
                        note="Measured records"
                      />
                      {(
                        [
                          "views_or_plays",
                          "engagements",
                          "watch_time_seconds",
                        ] as MetricName[]
                      )
                        .slice(0, 3)
                        .map((metric) => {
                          const value = analytics.totals[metric];
                          return (
                            <MiniMetric
                              key={metric}
                              label={METRIC_LABELS[metric]}
                              value={value ? formatReading(value) : "—"}
                              note={
                                value && !value.available
                                  ? UNAVAILABLE_LABELS[value.reason]
                                  : "Measured total"
                              }
                            />
                          );
                        })}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-ink-muted">
                      Last fetched{" "}
                      {describeFreshness(analytics.lastFetchedAt).toLowerCase()}
                      .
                    </p>
                  </>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Production Pipeline"
              description="Live counts derived from the production records, not a sample workflow."
              action={
                <Link
                  href="/dashboard/production"
                  className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                >
                  Open production board
                </Link>
              }
            >
              <WorkflowPipeline counts={stageCounts} />
            </SectionCard>

            <SectionCard
              title="Quick Actions"
              description="Jump directly into the working areas of the dashboard."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <QuickActionLink
                  href="/dashboard/content/new"
                  label="Create Content"
                  description="Start a new content item"
                  icon={FileText}
                />
                <QuickActionLink
                  href="/dashboard/scripture"
                  label="Scripture Studio"
                  description={`${scriptureNeedingAttention} needing attention`}
                  icon={ScrollText}
                />
                <QuickActionLink
                  href="/dashboard/scripts"
                  label="Script Studio"
                  description={`${itemsWithScripts} items with scripts`}
                  icon={Clapperboard}
                />
                <QuickActionLink
                  href="/dashboard/video"
                  label="Video Creation Studio"
                  description={`${videoProjectsCount} active video projects`}
                  icon={MonitorPlay}
                />
                <QuickActionLink
                  href="/dashboard/approvals"
                  label="Approval Queue"
                  description={`${approvalQueue.length} waiting for review`}
                  icon={CheckCircle2}
                />
                <QuickActionLink
                  href="/dashboard/calendar"
                  label="Content Calendar"
                  description={`${scheduled} scheduled posts`}
                  icon={CalendarDays}
                />
              </div>
            </SectionCard>
          </div>

          <aside className="flex min-w-0 flex-col gap-6">
            <SectionCard
              title="Post Preview"
              description="A truthful preview of the latest stored content item."
            >
              {latestContent ? (
                <div className="overflow-hidden rounded-2xl border border-edge bg-canvas/70 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                  <div className="aspect-[16/9] border-b border-edge bg-[radial-gradient(circle_at_25%_15%,rgba(77,141,247,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(201,169,97,0.12),transparent_30%),linear-gradient(145deg,#0c142a,#070b16)] p-5 sm:p-6">
                    <div className="flex h-full flex-col justify-between">
                      <span className="w-fit rounded-full border border-gold-dim/50 bg-gold/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-gold">
                        {latestContent.topic ??
                          CONTENT_TYPE_LABELS[latestContent.content_type]}
                      </span>
                      <div>
                        <p className="text-lg font-semibold leading-snug text-ink-primary sm:text-xl">
                          {latestContent.title}
                        </p>
                        {latestContent.scripture_reference ? (
                          <p className="mt-2 text-xs font-medium text-highlight-soft">
                            {latestContent.scripture_reference} ·{" "}
                            {latestContent.scripture_translation}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    {latestContent.scripture_reference ? (
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-ink-muted">Scripture status</span>
                        <StatusBadge
                          tone={
                            latestContent.scripture_verification_status ===
                            "manually_verified"
                              ? "configured"
                              : "inactive"
                          }
                        >
                          {
                            SCRIPTURE_VERIFICATION_LABELS[
                              latestContent.scripture_verification_status
                            ]
                          }
                        </StatusBadge>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink-muted">Content status</span>
                      <span className="font-medium text-ink-secondary">
                        {CONTENT_STATUS_LABELS[latestContent.status]}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/content/${latestContent.id}`}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition hover:bg-panel-hover"
                    >
                      Open content item
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={MonitorPlay}
                  title="Nothing to preview yet."
                  description="The latest real content item will appear here after one is created."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Video Creation Studio"
              description="Latest real project and timeline summary. Editing remains in the dedicated studio."
              action={
                <Link
                  href="/dashboard/video"
                  className="text-xs font-medium text-highlight-soft hover:text-ink-primary"
                >
                  Open studio
                </Link>
              }
            >
              {latestVideo ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-edge/70 bg-panel-raised/35 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink-primary">
                          {latestVideo.name}
                        </p>
                        <p className="mt-1 text-xs text-ink-muted">
                          {latestVideo.aspect_ratio} ·{" "}
                          {latestVideo.duration_estimate_seconds}s · revision{" "}
                          {latestVideo.current_revision}
                        </p>
                      </div>
                      <StatusBadge
                        tone={
                          latestVideo.status === "ready_for_review"
                            ? "accent"
                            : "inactive"
                        }
                      >
                        {VIDEO_PROJECT_STATUS_LABELS[latestVideo.status]}
                      </StatusBadge>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-secondary">
                        Timeline
                      </span>
                      <span className="text-ink-muted">
                        {latestScenes.length} scene
                        {latestScenes.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {latestScenes.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-edge-strong px-4 py-5 text-center text-xs text-ink-muted">
                        No scenes have been added to this project yet.
                      </div>
                    ) : (
                      <div className="flex min-h-14 gap-1 overflow-hidden rounded-xl border border-edge bg-canvas/70 p-2">
                        {latestScenes.slice(0, 8).map((scene) => (
                          <div
                            key={scene.id}
                            className="flex min-w-12 flex-1 items-center justify-center rounded-md border border-highlight/20 bg-highlight/10 px-1 text-center text-[9px] font-medium uppercase tracking-wide text-highlight-soft"
                            title={`${scene.scene_type} · ${scene.duration_seconds}s`}
                          >
                            {scene.scene_order}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Clapperboard}
                  title="No video project yet."
                  description="Create a video project in the studio to see its timeline summary here."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Creator Tools"
              description="Premium shortcuts with honest capability states."
            >
              <div className="space-y-2.5">
                <Link
                  href="/dashboard/captions"
                  className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-raised/35 p-3.5 transition hover:border-edge-strong hover:bg-panel-hover/55"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border border-highlight/20 bg-highlight/10 text-highlight-soft">
                    <Captions aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-primary">
                      Auto Captions
                    </span>
                    <span className="block text-xs leading-5 text-ink-muted">
                      Caption track workflow exists; automatic transcription is
                      not built.
                    </span>
                  </span>
                  <StatusBadge tone="inactive">Manual</StatusBadge>
                </Link>
                <Link
                  href="/dashboard/captions"
                  className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-raised/35 p-3.5 transition hover:border-edge-strong hover:bg-panel-hover/55"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border border-gold-dim/30 bg-gold/10 text-gold">
                    <WandSparkles aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-primary">
                      Caption Templates
                    </span>
                    <span className="block text-xs leading-5 text-ink-muted">
                      Caption Studio is available; reusable template automation
                      is not yet implemented.
                    </span>
                  </span>
                  <StatusBadge tone="inactive">Not built</StatusBadge>
                </Link>
                <Link
                  href="/dashboard/media"
                  className="flex items-center gap-3 rounded-xl border border-edge/70 bg-panel-raised/35 p-3.5 transition hover:border-edge-strong hover:bg-panel-hover/55"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg border border-edge bg-panel text-ink-secondary">
                    <Music2 aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-primary">
                      Music & Audio Library
                    </span>
                    <span className="block text-xs leading-5 text-ink-muted">
                      Use stored media assets for background audio and voice
                      files.
                    </span>
                  </span>
                  <StatusBadge tone="configured">Available</StatusBadge>
                </Link>
              </div>
            </SectionCard>

            <SectionCard
              title="System Status"
              description="Deployment truth, not decorative green lights."
            >
              <ul className="space-y-2.5">
                {readiness.map((entry) => (
                  <li
                    key={entry.label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-edge/70 bg-panel-raised/30 px-3.5 py-3"
                  >
                    <span className="text-sm text-ink-secondary">
                      {entry.label}
                    </span>
                    <StatusBadge tone={entry.ready ? "configured" : "inactive"}>
                      {entry.ready ? entry.readyLabel : entry.offLabel}
                    </StatusBadge>
                  </li>
                ))}
                {PLATFORMS.map(({ name, platform, icon }) => {
                  const account =
                    socialAccounts.find(
                      (candidate) => candidate.platform === platform,
                    ) ?? null;
                  return (
                    <PlatformStatus
                      key={name}
                      name={name}
                      icon={icon}
                      status={account?.status ?? null}
                      identity={
                        account?.handle ??
                        account?.channel_title ??
                        account?.display_name ??
                        null
                      }
                    />
                  );
                })}
              </ul>
              {publishFailures > 0 ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-gold-dim/40 bg-gold/10 px-3 py-2.5 text-xs leading-5 text-gold">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {publishFailures} publish failure
                  {publishFailures === 1 ? " is" : "s are"} recorded and should
                  be reviewed.
                </div>
              ) : null}
              <Link
                href="/dashboard/settings"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-highlight-soft hover:text-ink-primary"
              >
                Full operational readiness{" "}
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </Link>
            </SectionCard>

            <div className="grid grid-cols-2 gap-3">
              <MiniMetric
                label="Approved"
                value={approved}
                note="Still valid"
              />
              <MiniMetric
                label="Videos"
                value={videoProjectsCount}
                note="Active projects"
              />
            </div>
          </aside>
        </div>
      </div>
    </DashboardShell>
  );
}
