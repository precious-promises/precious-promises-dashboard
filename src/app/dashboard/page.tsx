import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clapperboard,
  Clock3,
  FileText,
  Images,
  Layers3,
  Library,
  MonitorPlay,
  Music2,
  ScrollText,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { EMPTY_FILTERS } from "@/lib/content/filters";
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
import { countVideoProjects } from "@/lib/video/repository";
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

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  accent: "purple" | "gold" | "blue" | "green";
}) {
  const accentClasses = {
    purple: "border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]",
    gold: "border-gold-dim/35 bg-gold/10 text-gold",
    blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  } as const;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.035em] text-ink-primary">
            {value}
          </p>
        </div>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${accentClasses[accent]}`}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-highlight-soft transition hover:text-ink-primary"
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </Link>
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
  ] = await Promise.all([
    getContentCounts(),
    countScriptureNeedingAttention(),
    countItemsWithScripts(),
    countVideoProjects(),
    loadReviewRows(),
    listScheduleEntries(),
    loadBoard(),
    loadSocialAccounts(),
    listContentItems(EMPTY_FILTERS),
  ]);

  const analytics = await loadAnalyticsOverview();
  const now = new Date();
  const upcoming = upcomingEntries(scheduleEntries, now, 6);
  const todayEntries = scheduleEntries
    .filter(
      (entry) =>
        entry.post.status === "scheduled" &&
        sameScheduleDay(
          new Date(entry.post.scheduled_for),
          entry.post.timezone,
          now,
        ),
    )
    .slice(0, 5);
  const awaitingApproval = reviewRows.filter(
    (row) => row.variant.review_state === "ready_for_review",
  ).length;
  const approvalQueue = reviewRows
    .filter((row) => row.variant.review_state === "ready_for_review")
    .slice(0, 5);
  const latestContent = recentItems[0] ?? null;

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
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.24),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.11),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Creator Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                {greeting}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                See what needs attention, what is moving through production and
                what is ready to publish without leaving the overview.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href="/dashboard/content/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  <FileText aria-hidden="true" className="size-4" />
                  Create content
                </Link>
                <Link
                  href="/dashboard/calendar"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  <CalendarDays aria-hidden="true" className="size-4" />
                  Open calendar
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-edge/75 bg-black/15 px-4 py-3 xl:min-w-[260px]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-ink-primary">
                  Live workspace truth
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">
                  Stored records only. No decorative metrics.
                </span>
              </span>
            </div>
          </div>
        </section>

        <section
          aria-label="Dashboard metrics"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <MetricCard
            label="Content"
            value={counts.total}
            note="Stored content items"
            icon={Layers3}
            accent="purple"
          />
          <MetricCard
            label="Awaiting approval"
            value={awaitingApproval}
            note="Needs your decision"
            icon={CheckSquare}
            accent="gold"
          />
          <MetricCard
            label="Scheduled"
            value={scheduled}
            note="Future publish records"
            icon={Clock3}
            accent="blue"
          />
          <MetricCard
            label="Published"
            value={postedThisWeek}
            note="Recorded in the last 7 days"
            icon={Send}
            accent="green"
          />
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <SectionCard
              title="Today’s Schedule"
              description="The posts genuinely scheduled for today, shown in each stored timezone."
              action={
                <SectionLink href="/dashboard/calendar">
                  Open calendar
                </SectionLink>
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
                        className="group flex items-center gap-3 rounded-xl border border-edge/70 bg-white/[0.018] px-3.5 py-3 transition hover:border-edge-strong hover:bg-white/[0.045]"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
                          <CalendarClock
                            aria-hidden="true"
                            className="size-4"
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-primary">
                            {entry.item.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-muted">
                            {PLATFORM_LABELS[entry.variant.platform]} ·{" "}
                            {formatInTimeZone(
                              new Date(entry.post.scheduled_for),
                              entry.post.timezone,
                            )}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink-primary"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="xl:col-span-5">
            <SectionCard
              title="Approval Queue"
              description="Variants waiting for you. AI never approves content on your behalf."
              action={
                <SectionLink href="/dashboard/approvals">
                  Review queue
                </SectionLink>
              }
            >
              {approvalQueue.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Approval queue is clear."
                  description="Items marked ready for review will appear here."
                />
              ) : (
                <ul className="space-y-2">
                  {approvalQueue.map((row) => (
                    <li key={row.variant.id}>
                      <Link
                        href={`/dashboard/approvals?variant=${row.variant.id}`}
                        className="flex items-center gap-3 rounded-xl border border-edge/70 bg-white/[0.018] px-3.5 py-3 transition hover:border-edge-strong hover:bg-white/[0.045]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-primary">
                            {row.item.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-muted">
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
              )}
            </SectionCard>
          </div>

          <div className="xl:col-span-7">
            <SectionCard
              title="Recent Content"
              description="Your latest stored content records, ordered by recent activity."
              action={
                <SectionLink href="/dashboard/content">
                  Open library
                </SectionLink>
              }
            >
              {recentItems.length === 0 ? (
                <EmptyState
                  icon={Library}
                  title="No content yet."
                  description="Create the first content item to start the workflow."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-edge/70">
                  <ul className="divide-y divide-edge/65">
                    {recentItems.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/dashboard/content/${item.id}`}
                          className="flex items-center gap-3 bg-white/[0.012] px-3.5 py-3 transition hover:bg-white/[0.04] sm:px-4"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-edge bg-[#080d19] text-ink-muted">
                            <FileText aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-primary">
                              {item.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-muted">
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
                </div>
              )}
            </SectionCard>
          </div>

          <div className="xl:col-span-5">
            <SectionCard
              title="Performance Snapshot"
              description="Measured platform data only. Unavailable data stays unavailable."
              action={
                <SectionLink href="/dashboard/analytics">
                  Open analytics
                </SectionLink>
              }
            >
              {analytics.publishedCount === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No measured performance yet."
                  description="Nothing has been published and measured through a connected analytics source yet."
                />
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <MetricCard
                      label="Published"
                      value={analytics.publishedCount}
                      note="Measured records"
                      icon={Send}
                      accent="green"
                    />
                    {(
                      [
                        "views_or_plays",
                        "engagements",
                        "watch_time_seconds",
                      ] as MetricName[]
                    )
                      .slice(0, 3)
                      .map((metric, index) => {
                        const value = analytics.totals[metric];
                        const accents = ["purple", "gold", "blue"] as const;
                        return (
                          <MetricCard
                            key={metric}
                            label={METRIC_LABELS[metric]}
                            value={value ? formatReading(value) : "—"}
                            note={
                              value && !value.available
                                ? UNAVAILABLE_LABELS[value.reason]
                                : "Measured total"
                            }
                            icon={BarChart3}
                            accent={accents[index]}
                          />
                        );
                      })}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-muted">
                    Last fetched{" "}
                    {describeFreshness(analytics.lastFetchedAt).toLowerCase()}.
                  </p>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="xl:col-span-5">
            <SectionCard
              title="Post Preview"
              description="A visual preview of the latest stored content item."
            >
              {latestContent ? (
                <div className="overflow-hidden rounded-2xl border border-edge/80 bg-[#080d18] shadow-[0_20px_55px_rgba(0,0,0,0.24)]">
                  <div className="relative aspect-[16/10] overflow-hidden border-b border-edge/70 bg-[radial-gradient(circle_at_18%_8%,rgba(113,56,220,0.28),transparent_36%),radial-gradient(circle_at_86%_18%,rgba(201,169,97,0.14),transparent_30%),linear-gradient(145deg,#0b1122,#050912)] p-5 sm:p-6">
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[linear-gradient(120deg,transparent_42%,rgba(255,255,255,0.025)_43%,transparent_45%)]"
                    />
                    <div className="relative flex h-full flex-col justify-between">
                      <span className="w-fit rounded-full border border-gold-dim/45 bg-black/20 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">
                        {latestContent.topic ??
                          CONTENT_TYPE_LABELS[latestContent.content_type]}
                      </span>
                      <div>
                        <p className="max-w-md text-xl font-semibold leading-tight tracking-[-0.02em] text-ink-primary sm:text-2xl">
                          {latestContent.title}
                        </p>
                        {latestContent.scripture_reference ? (
                          <p className="mt-2 text-xs font-semibold text-[#bda7ff]">
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
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-3.5 py-2.5 text-xs font-semibold text-ink-primary transition hover:bg-white/[0.055]"
                    >
                      Open content item
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
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
          </div>

          <div className="xl:col-span-7">
            <SectionCard
              title="Content Calendar"
              description="The next approved items that have a real stored schedule time."
              action={
                <SectionLink href="/dashboard/calendar">
                  View calendar
                </SectionLink>
              }
            >
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Calendar is clear."
                  description="Approve a platform variant and assign a time to make it appear here."
                />
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {upcoming.map((entry) => (
                    <Link
                      key={entry.post.id}
                      href={`/dashboard/calendar?entry=${entry.post.id}`}
                      className="group rounded-xl border border-edge/70 bg-white/[0.018] p-3.5 transition hover:border-edge-strong hover:bg-white/[0.045]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gold">
                          {PLATFORM_LABELS[entry.variant.platform]}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-3.5 text-ink-muted transition group-hover:translate-x-0.5"
                        />
                      </div>
                      <span className="mt-1.5 block line-clamp-2 text-sm font-medium text-ink-primary">
                        {entry.item.title}
                      </span>
                      <span className="mt-2.5 block text-xs text-ink-muted">
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

          <div className="xl:col-span-12">
            <SectionCard
              title="Production Progress"
              description="Live counts derived from real production records across the content workflow."
              action={
                <SectionLink href="/dashboard/production">
                  Open board
                </SectionLink>
              }
            >
              <WorkflowPipeline counts={stageCounts} />
            </SectionCard>
          </div>

          <div className="xl:col-span-8">
            <SectionCard
              title="Quick Actions"
              description="Move directly into the next working area without duplicating full studios on the dashboard."
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
                  description={`${awaitingApproval} waiting for review`}
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

          <div className="xl:col-span-4">
            <SectionCard
              title="System Status"
              description="Operational truth only. Implemented is not connected; connected is not authorised; authorised is not live-verified."
              action={
                <SectionLink href="/dashboard/settings">
                  Full readiness
                </SectionLink>
              }
            >
              <ul className="space-y-2">
                {readiness.map((entry) => (
                  <li
                    key={entry.label}
                    className="flex items-center justify-between gap-3 rounded-xl border border-edge/70 bg-white/[0.018] px-3.5 py-3"
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
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-gold-dim/40 bg-gold/10 px-3 py-2.5 text-xs leading-5 text-gold">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  {publishFailures} publish failure
                  {publishFailures === 1 ? " is" : "s are"} recorded and should
                  be reviewed.
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-edge/70 bg-white/[0.018] px-3 py-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    Approved
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                    {approved}
                  </p>
                </div>
                <div className="rounded-xl border border-edge/70 bg-white/[0.018] px-3 py-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                    Video projects
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                    {videoProjectsCount}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
