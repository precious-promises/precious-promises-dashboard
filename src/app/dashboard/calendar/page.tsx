import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  PauseCircle,
  Plus,
  Repeat2,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  cancelSchedule,
  resumeSchedule,
} from "@/app/dashboard/calendar/actions";
import { MonthGrid } from "@/components/calendar/month-grid";
import { RecurringRules } from "@/components/calendar/recurring-rules";
import { ScheduleForm } from "@/components/calendar/schedule-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadReviewRows } from "@/lib/approvals/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "@/lib/content/types";
import {
  applyFilters,
  buildMonthGrid,
  parseMonthParam,
  shiftMonth,
  type CalendarFilters,
} from "@/lib/schedule/calendar";
import {
  listRecurringRules,
  listScheduleEntries,
  upcomingEntries,
} from "@/lib/schedule/repository";
import {
  DEFAULT_TIMEZONE,
  formatInTimeZone,
  isoDateInTimeZone,
} from "@/lib/schedule/timezone";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  type ScheduleStatus,
} from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PLATFORM_LABELS,
  VARIANT_PLATFORMS,
  type VariantPlatform,
} from "@/lib/variants/types";

export const metadata: Metadata = {
  title: "Content Calendar · Precious Promises",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  scheduled:
    "Scheduled. The publish run sends it when due — only while the approval still matches and the platform is connected.",
  cancelled: "Schedule cancelled, with the reason recorded.",
  resumed: "Schedule reinstated against the current approval.",
  "resume-refused":
    "That schedule cannot resume: the variant is not approved, or its approval no longer matches its content.",
  "resume-past": "That time has already passed. Schedule a new time instead.",
  "transition-refused": "That change is not allowed from the current state.",
  "slot-saved": "Recurring slot saved. Slots schedule nothing on their own.",
  "slot-toggled": "Recurring slot updated.",
  "slot-invalid": "That slot could not be saved. Check the name, day and time.",
  "slot-failed": "That slot could not be saved. Please try again.",
  "slot-duplicate": "A slot with that name already exists.",
  "presets-created":
    "Slots created, all disabled. Nothing has been scheduled and no content was chosen.",
};

const FILTER_FIELD =
  "w-full rounded-xl border border-edge bg-[#080d18] px-3 py-2 text-sm text-ink-primary outline-none transition-colors focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/20";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function countStatus(
  entries: Awaited<ReturnType<typeof listScheduleEntries>>,
  status: ScheduleStatus,
): number {
  return entries.filter((entry) => entry.post.status === status).length;
}

export default async function CalendarPage(
  props: PageProps<"/dashboard/calendar">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const notice = firstParam(searchParams.notice);
  const selectedEntryId = firstParam(searchParams.entry);
  const selectedVariantId = firstParam(searchParams.variant);
  const platformParam = firstParam(searchParams.platform);
  const typeParam = firstParam(searchParams.type);
  const statusParam = firstParam(searchParams.status);

  const filters: CalendarFilters = {
    platform: VARIANT_PLATFORMS.includes(platformParam as VariantPlatform)
      ? (platformParam as VariantPlatform)
      : null,
    contentType: CONTENT_TYPES.includes(typeParam as ContentType)
      ? (typeParam as ContentType)
      : null,
    status: SCHEDULE_STATUSES.includes(statusParam as ScheduleStatus)
      ? (statusParam as ScheduleStatus)
      : null,
  };

  const now = new Date();
  const timeZone = DEFAULT_TIMEZONE;
  const { year, month } = parseMonthParam(
    firstParam(searchParams.month),
    now,
    timeZone,
  );

  const [allEntries, rules, reviewRows] = await Promise.all([
    listScheduleEntries(),
    listRecurringRules(),
    loadReviewRows(),
  ]);

  const entries = applyFilters(allEntries, filters);
  const grid = buildMonthGrid(year, month, timeZone, entries);
  const upcoming = upcomingEntries(entries, now, 8);
  const selectedEntry =
    allEntries.find((entry) => entry.post.id === selectedEntryId) ?? null;

  const schedulable = reviewRows
    .filter((row) => row.validity === "valid")
    .map((row) => ({
      id: row.variant.id,
      itemTitle: row.item.title,
      platform: row.variant.platform,
      variantType: row.variant.variant_type,
      contentType: row.item.content_type,
    }));

  const todayKey = isoDateInTimeZone(now, timeZone);
  const todayEntries = allEntries.filter(
    (entry) =>
      entry.post.status === "scheduled" &&
      isoDateInTimeZone(new Date(entry.post.scheduled_for), timeZone) ===
        todayKey,
  );
  const activeRules = rules.filter((rule) => rule.enabled).length;
  const scheduledCount = countStatus(allEntries, "scheduled");
  const pausedCount = countStatus(allEntries, "paused");
  const cancelledCount = countStatus(allEntries, "cancelled");
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;
  const monthHref = (value: string) => `/dashboard/calendar?month=${value}`;

  return (
    <DashboardShell
      title="Content Calendar"
      pathname="/dashboard/calendar"
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
                Publishing Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Content Calendar
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Plan approved Precious Promises content, see the real publishing
                rhythm and manage upcoming slots from one place. Times display
                in {timeZone}; schedule records do not claim a post was
                published.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <a
                  href="#schedule-content"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Schedule content
                </a>
                <Link
                  href="/dashboard/approvals"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  Review approvals
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-edge/75 bg-black/15 px-4 py-3 xl:min-w-[270px]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300">
                <CalendarRange aria-hidden="true" className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-ink-primary">
                  Display timezone
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">
                  {timeZone}
                </span>
              </span>
            </div>
          </div>
        </section>

        <section
          aria-label="Calendar summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          {[
            {
              label: "Scheduled",
              value: scheduledCount,
              detail: "Active intentions",
              icon: Send,
              tone: "text-[#bda7ff] border-[#7138dc]/25 bg-[#7138dc]/10",
            },
            {
              label: "Today",
              value: todayEntries.length,
              detail: "Due today",
              icon: Clock3,
              tone: "text-sky-300 border-sky-400/20 bg-sky-400/10",
            },
            {
              label: "Approved",
              value: schedulable.length,
              detail: "Ready to schedule",
              icon: CheckCircle2,
              tone: "text-emerald-300 border-emerald-400/20 bg-emerald-400/10",
            },
            {
              label: "Paused",
              value: pausedCount,
              detail: "Need attention",
              icon: PauseCircle,
              tone: "text-gold border-gold-dim/35 bg-gold/10",
            },
            {
              label: "Recurring",
              value: activeRules,
              detail: `${rules.length} total slots`,
              icon: Repeat2,
              tone: "text-ink-secondary border-edge bg-white/[0.025]",
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.035em] text-ink-primary">
                    {metric.value}
                  </p>
                </div>
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${metric.tone}`}
                >
                  <metric.icon aria-hidden="true" className="size-4" />
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                {metric.detail}
              </p>
            </div>
          ))}
        </section>

        {notice && NOTICES[notice] ? (
          <div
            role="status"
            className="rounded-xl border border-highlight-dim/50 bg-highlight/[0.07] px-4 py-3 text-sm leading-6 text-ink-secondary"
          >
            {NOTICES[notice]}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
          <SectionCard
            title={grid.label}
            description={
              entries.length === 0
                ? "No real schedule entries match this view."
                : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} match this view.`
            }
            action={
              <span className="flex items-center gap-2">
                <Link
                  href={monthHref(shiftMonth(year, month, -1))}
                  aria-label="Previous month"
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-edge bg-panel-raised/55 text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </Link>
                <Link
                  href={monthHref(shiftMonth(year, month, 1))}
                  aria-label="Next month"
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-edge bg-panel-raised/55 text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              </span>
            }
            className="overflow-hidden"
          >
            <form
              method="get"
              action="/dashboard/calendar"
              className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-edge/70 bg-black/10 p-3.5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto] xl:items-end"
            >
              <input type="hidden" name="month" value={monthValue} />
              <div>
                <label
                  htmlFor="platform"
                  className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  Platform
                </label>
                <select
                  id="platform"
                  name="platform"
                  defaultValue={filters.platform ?? ""}
                  className={FILTER_FIELD}
                >
                  <option value="">All platforms</option>
                  {VARIANT_PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {PLATFORM_LABELS[platform]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="type"
                  className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  Content type
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue={filters.contentType ?? ""}
                  className={FILTER_FIELD}
                >
                  <option value="">All content</option>
                  {CONTENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CONTENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="status"
                  className="mb-1.5 block text-[11px] font-semibold tracking-wide text-ink-muted uppercase"
                >
                  Schedule status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={filters.status ?? ""}
                  className={FILTER_FIELD}
                >
                  <option value="">All statuses</option>
                  {SCHEDULE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {SCHEDULE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-xl border border-edge-strong bg-white/[0.035] px-4 py-2 text-sm font-semibold text-ink-primary transition hover:bg-white/[0.065]"
              >
                Apply filters
              </button>
              <Link
                href={`/dashboard/calendar?month=${monthValue}`}
                className="rounded-xl px-3 py-2 text-center text-sm text-ink-muted transition-colors hover:text-ink-primary"
              >
                Clear
              </Link>
            </form>

            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-highlight" /> Scheduled
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-gold" /> Paused
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-ink-muted" /> Cancelled
              </span>
              <span className="ml-auto">Display zone: {timeZone}</span>
            </div>

            <MonthGrid grid={grid} timeZone={timeZone} now={now} />
          </SectionCard>

          <div className="flex flex-col gap-5">
            <SectionCard
              title="Today’s Schedule"
              description={`${todayEntries.length} active ${todayEntries.length === 1 ? "post" : "posts"} due today.`}
            >
              {todayEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-edge px-4 py-5 text-center">
                  <CalendarDays
                    aria-hidden="true"
                    className="mx-auto size-5 text-ink-muted"
                  />
                  <p className="mt-2 text-sm font-medium text-ink-secondary">
                    Nothing due today
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    No scheduled rows fall on today in {timeZone}.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {todayEntries.map((entry) => (
                    <li
                      key={entry.post.id}
                      className="rounded-xl border border-edge/70 bg-white/[0.02] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-primary">
                            {entry.item.title}
                          </p>
                          <p className="mt-1 text-xs text-ink-muted">
                            {PLATFORM_LABELS[entry.variant.platform]} ·{" "}
                            {formatInTimeZone(
                              new Date(entry.post.scheduled_for),
                              entry.post.timezone,
                            )}
                          </p>
                        </div>
                        <StatusBadge tone="configured">Scheduled</StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Calendar Health"
              description="Stored schedule state, not platform delivery claims."
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-edge/70 bg-white/[0.02] p-3">
                  <p className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                    Scheduled
                  </p>
                  <p className="mt-1 text-xl font-semibold text-ink-primary">
                    {scheduledCount}
                  </p>
                </div>
                <div className="rounded-xl border border-edge/70 bg-white/[0.02] p-3">
                  <p className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                    Paused
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gold">
                    {pausedCount}
                  </p>
                </div>
                <div className="rounded-xl border border-edge/70 bg-white/[0.02] p-3">
                  <p className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                    Cancelled
                  </p>
                  <p className="mt-1 text-xl font-semibold text-ink-secondary">
                    {cancelledCount}
                  </p>
                </div>
                <div className="rounded-xl border border-edge/70 bg-white/[0.02] p-3">
                  <p className="text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                    Ready
                  </p>
                  <p className="mt-1 text-xl font-semibold text-highlight">
                    {schedulable.length}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-ink-muted">
                A scheduled row is not proof of delivery. Publication still
                depends on a valid approval and an available platform connection
                when the publish run executes.
              </p>
            </SectionCard>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
          <SectionCard
            title="Upcoming Schedule"
            description="Active schedule rows, soonest first."
          >
            {upcoming.length === 0 ? (
              <div className="rounded-xl border border-dashed border-edge px-4 py-8 text-center">
                <Clock3
                  aria-hidden="true"
                  className="mx-auto size-6 text-ink-muted"
                />
                <p className="mt-2 text-sm font-medium text-ink-secondary">
                  Nothing upcoming
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Approve a platform variant, then give it a date and time.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {upcoming.map((entry) => (
                  <li key={entry.post.id}>
                    <Link
                      href={`/dashboard/calendar?entry=${entry.post.id}&month=${monthValue}`}
                      className="block rounded-xl border border-edge/70 bg-white/[0.02] p-3.5 transition hover:border-edge-strong hover:bg-white/[0.045]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink-primary">
                            {entry.item.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-ink-muted">
                            {PLATFORM_LABELS[entry.variant.platform]} ·{" "}
                            {formatInTimeZone(
                              new Date(entry.post.scheduled_for),
                              entry.post.timezone,
                            )}
                          </span>
                        </span>
                        <StatusBadge
                          tone={
                            entry.post.status === "scheduled"
                              ? "configured"
                              : "inactive"
                          }
                        >
                          {SCHEDULE_STATUS_LABELS[entry.post.status]}
                        </StatusBadge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {selectedEntry ? (
              <div className="mt-5 rounded-xl border border-highlight-dim/50 bg-highlight/[0.055] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold tracking-[0.14em] text-highlight uppercase">
                      Selected schedule
                    </p>
                    <p className="mt-1 text-base font-semibold text-ink-primary">
                      {selectedEntry.item.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {PLATFORM_LABELS[selectedEntry.variant.platform]} ·{" "}
                      {formatInTimeZone(
                        new Date(selectedEntry.post.scheduled_for),
                        selectedEntry.post.timezone,
                      )}{" "}
                      · {SCHEDULE_STATUS_LABELS[selectedEntry.post.status]}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      selectedEntry.post.status === "scheduled"
                        ? "configured"
                        : "inactive"
                    }
                  >
                    {SCHEDULE_STATUS_LABELS[selectedEntry.post.status]}
                  </StatusBadge>
                </div>

                {selectedEntry.post.pause_reason ? (
                  <p className="mt-3 rounded-lg border border-gold-dim/40 bg-gold/[0.07] px-3 py-2 text-xs text-gold">
                    Paused: {selectedEntry.post.pause_reason}
                  </p>
                ) : null}
                {selectedEntry.post.cancellation_reason ? (
                  <p className="mt-3 rounded-lg border border-edge/70 bg-panel/30 px-3 py-2 text-xs text-ink-muted">
                    Cancelled: {selectedEntry.post.cancellation_reason}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href={`/dashboard/content/${selectedEntry.item.id}`}
                    className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary"
                  >
                    Open content
                  </Link>

                  {selectedEntry.post.status === "paused" ? (
                    <form action={resumeSchedule}>
                      <input
                        type="hidden"
                        name="scheduled_post_id"
                        value={selectedEntry.post.id}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-highlight-dim/60 bg-highlight/10 px-3 py-1.5 text-xs font-medium text-highlight transition-colors hover:bg-highlight/15"
                      >
                        Reinstate with current approval
                      </button>
                    </form>
                  ) : null}

                  {selectedEntry.post.status !== "cancelled" ? (
                    <form
                      action={cancelSchedule}
                      className="flex flex-wrap gap-2"
                    >
                      <input
                        type="hidden"
                        name="scheduled_post_id"
                        value={selectedEntry.post.id}
                      />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Cancellation reason"
                        maxLength={2000}
                        className="rounded-lg border border-edge bg-[#080d18] px-2.5 py-1.5 text-xs text-ink-primary outline-none focus-visible:border-highlight"
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary"
                      >
                        Cancel schedule
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : null}
          </SectionCard>

          <div id="schedule-content">
            <SectionCard
              title="Schedule Content"
              description={`${schedulable.length} currently approved ${schedulable.length === 1 ? "variant" : "variants"} available.`}
              className="h-full"
            >
              <div className="mb-4 rounded-xl border border-highlight-dim/40 bg-highlight/[0.055] px-3.5 py-3 text-xs leading-5 text-ink-secondary">
                Only approvals that still match their content appear below. The
                server checks the approval again when you submit.
              </div>
              <ScheduleForm
                variants={schedulable}
                selectedVariantId={selectedVariantId}
                timezone={timeZone}
              />
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="Publishing Rhythm & Recurring Slots"
          description={`Plan the weekly rhythm in ${timeZone}. Slots never choose content or publish by themselves.`}
          action={
            <span className="flex items-center gap-2 rounded-lg border border-edge/70 bg-panel-raised/45 px-2.5 py-1.5 text-xs text-ink-muted">
              <Repeat2 aria-hidden="true" className="size-3.5 text-highlight" />
              {activeRules} enabled · {rules.length} total
            </span>
          }
        >
          <RecurringRules rules={rules} now={now} />
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
