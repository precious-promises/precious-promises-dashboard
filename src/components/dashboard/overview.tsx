import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clapperboard,
  FileText,
  Images,
  Library,
  MessageSquareText,
  MonitorPlay,
  Music2,
  ScrollText,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "./dashboard-shell";
import { PlatformStatus } from "./platform-status";
import { SectionCard } from "@/components/ui/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
} from "@/lib/content/types";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import {
  describeFreshness,
  formatReading,
  METRIC_LABELS,
  METRIC_SOURCE_LABELS,
  UNAVAILABLE_LABELS,
  type MetricName,
} from "@/lib/analytics/types";
import { formatInTimeZone } from "@/lib/schedule/timezone";
import type { loadDashboardData } from "@/lib/dashboard/overview";
import { OverviewCalendar } from "./overview-calendar";
import { ProductionSummary } from "./production-summary";
import styles from "./overview.module.css";
const PLATFORMS = [
  { name: "YouTube", platform: "youtube", icon: MonitorPlay },
  { name: "Instagram", platform: "instagram", icon: Images },
  { name: "TikTok", platform: "tiktok", icon: Music2 },
] as const;

function formatUpdated(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
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
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricIcon}>
        <Icon aria-hidden="true" />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}
function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-highlight-soft transition hover:text-ink-primary"
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </Link>
  );
}

function OverviewPanel(props: React.ComponentProps<typeof SectionCard>) {
  return <SectionCard {...props} className={styles.panel} />;
}
function OverviewEmpty(props: React.ComponentProps<typeof EmptyState>) {
  return <EmptyState {...props} className={styles.empty} />;
}

export function DashboardOverview({
  data,
  email,
}: {
  data: Awaited<ReturnType<typeof loadDashboardData>>;
  email: string | null;
}) {
  const {
    videoProjectsCount,
    scheduleEntries,
    board,
    socialAccounts,
    recentItems,
    analytics,
    now,
    todayEntries,
    awaitingApproval,
    approvalQueue,
    latestContent,
    stageCounts,
    approved,
    postedThisWeek,
    publishFailures,
    readiness,
    greeting,
    timezone,
  } = data;
  return (
    <DashboardShell title="Dashboard" pathname="/dashboard" email={email}>
      <div className={styles.overview}>
        <div className={styles.toolbar}>
          <div>
            <p>Creator command centre</p>
            <h2>{greeting}</h2>
          </div>
          <div className={styles.toolbarActions}>
            <span>
              {new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: timezone,
              }).format(now)}
            </span>
            <Link href="/dashboard/content/new">
              <FileText aria-hidden="true" />
              Create content
            </Link>
          </div>
        </div>
        <section aria-label="Dashboard metrics" className={styles.metrics}>
          <MetricCard
            label="Today’s schedule"
            value={todayEntries.length}
            note="Scheduled intentions"
            icon={CalendarDays}
          />
          <MetricCard
            label="Awaiting approval"
            value={awaitingApproval}
            note="Needs your decision"
            icon={CheckSquare}
          />
          <MetricCard
            label="In production"
            value={board.length}
            note="Active content items"
            icon={Clapperboard}
          />
          <MetricCard
            label="Recorded as posted"
            value={postedThisWeek}
            note="Last 7 days · not a live check"
            icon={Send}
          />
        </section>
        <div className={styles.grid}>
          <div className={styles.planningStack}>
            <div className={styles.calendar}>
              <OverviewPanel
                title="Content Calendar"
                action={
                  <SectionLink href="/dashboard/calendar">View all</SectionLink>
                }
              >
                <OverviewCalendar
                  now={now.toISOString()}
                  timezone={timezone}
                  entries={scheduleEntries.filter(
                    (entry) => entry.post.status === "scheduled",
                  )}
                />
              </OverviewPanel>
            </div>
            <div className={styles.schedule}>
              <OverviewPanel
                title="Today’s Schedule"
                action={
                  <SectionLink href="/dashboard/calendar">
                    Open calendar
                  </SectionLink>
                }
              >
                {todayEntries.length === 0 ? (
                  <OverviewEmpty
                    icon={CalendarClock}
                    title="Nothing scheduled today."
                    description="There are no stored scheduled posts for today."
                  />
                ) : (
                  <ul className="space-y-2">
                    {todayEntries.slice(0, 3).map((entry) => (
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
              </OverviewPanel>
            </div>
          </div>
          <div className={styles.workStack}>
            <div className={styles.approval}>
              <OverviewPanel
                title="Approval Queue"
                action={
                  <SectionLink href="/dashboard/approvals">
                    Review queue
                  </SectionLink>
                }
              >
                {approvalQueue.length === 0 ? (
                  <OverviewEmpty
                    icon={CheckCircle2}
                    title="Approval queue is clear."
                    description="Items marked ready for review will appear here."
                  />
                ) : (
                  <ul className="space-y-2">
                    {approvalQueue.slice(0, 3).map((row) => (
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
              </OverviewPanel>
            </div>
            <div className={styles.recent}>
              <OverviewPanel
                title="Recent Content"
                action={
                  <SectionLink href="/dashboard/content">
                    Open library
                  </SectionLink>
                }
              >
                {recentItems.length === 0 ? (
                  <OverviewEmpty
                    icon={Library}
                    title="No content yet."
                    description="Create the first content item to start the workflow."
                  />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-edge/70">
                    <ul className="divide-y divide-edge/65">
                      {recentItems.slice(0, 4).map((item) => (
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
                                {formatUpdated(item.updated_at, timezone)}
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
              </OverviewPanel>
            </div>
          </div>
          <div className={styles.performance}>
            <OverviewPanel
              title="Performance Snapshot"
              action={
                <SectionLink href="/dashboard/analytics">Analytics</SectionLink>
              }
            >
              <dl className={styles.performance}>
                {(
                  [
                    "views_or_plays",
                    "engagements",
                    "watch_time_seconds",
                    "followers_gained",
                  ] as MetricName[]
                ).map((metric) => {
                  const reading = analytics.totals[metric];
                  return (
                    <div key={metric}>
                      <dt>{METRIC_LABELS[metric]}</dt>
                      <dd>{formatReading(reading)}</dd>
                      <span>
                        {reading.available
                          ? METRIC_SOURCE_LABELS[reading.source]
                          : UNAVAILABLE_LABELS[reading.reason]}
                      </span>
                    </div>
                  );
                })}
              </dl>
              <p className={styles.footnote}>
                {analytics.hasAnyData
                  ? `Last fetched ${describeFreshness(analytics.lastFetchedAt).toLowerCase()}.`
                  : "No measured performance yet. Connect an analytics source to begin."}{" "}
                <Link href="/dashboard/analytics">View sources</Link>
              </p>
            </OverviewPanel>
          </div>
          <div className={styles.actions}>
            <OverviewPanel title="Quick Actions">
              <div className={styles.actions}>
                {[
                  {
                    href: "/dashboard/content/new",
                    label: "New content",
                    icon: FileText,
                  },
                  {
                    href: "/dashboard/video",
                    label: "Video Studio",
                    icon: MonitorPlay,
                  },
                  {
                    href: "/dashboard/scripture",
                    label: "Scripture",
                    icon: ScrollText,
                  },
                  {
                    href: "/dashboard/scripts",
                    label: "Script Studio",
                    icon: Clapperboard,
                  },
                  {
                    href: "/dashboard/captions",
                    label: "Captions",
                    icon: MessageSquareText,
                  },
                  {
                    href: "/dashboard/media",
                    label: "Media assets",
                    icon: Images,
                  },
                ].map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href}>
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </OverviewPanel>
          </div>
          <div className={styles.preview}>
            <OverviewPanel title="Post Preview">
              {latestContent ? (
                <div className="overflow-hidden rounded-2xl border border-edge/80 bg-[#080d18] shadow-[0_20px_55px_rgba(0,0,0,0.24)]">
                  <div className="relative aspect-[16/7] overflow-hidden border-b border-edge/70 bg-[radial-gradient(circle_at_18%_8%,rgba(113,56,220,0.28),transparent_36%),radial-gradient(circle_at_86%_18%,rgba(201,169,97,0.14),transparent_30%),linear-gradient(145deg,#0b1122,#050912)] p-5 sm:p-6">
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
                <OverviewEmpty
                  icon={MonitorPlay}
                  title="Nothing to preview yet."
                  description="The latest real content item will appear here after one is created."
                />
              )}
            </OverviewPanel>
          </div>
          <div className={styles.production}>
            <OverviewPanel
              title="Production Progress"
              action={
                <SectionLink href="/dashboard/production">
                  Open board
                </SectionLink>
              }
            >
              <ProductionSummary counts={stageCounts} total={board.length} />
              <p className={styles.footnote}>
                Publishing outcomes are recorded separately in the{" "}
                <Link href="/dashboard/publish">Publish Queue</Link>.
              </p>
            </OverviewPanel>
          </div>
          <div className={styles.system}>
            <OverviewPanel
              title="System Status"
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
              <div className={styles.systemTotals}>
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
            </OverviewPanel>
          </div>
        </div>
        <p className={styles.legend}>
          Implemented ≠ configured ≠ connected ≠ authorised ≠ live verified.
          Approval and scheduling never prove publication.
        </p>
      </div>
    </DashboardShell>
  );
}
