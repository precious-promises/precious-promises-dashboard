import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MonthGrid } from "@/components/calendar/month-grid";
import { RecurringRules } from "@/components/calendar/recurring-rules";
import { ScheduleForm } from "@/components/calendar/schedule-form";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  cancelSchedule,
  resumeSchedule,
} from "@/app/dashboard/calendar/actions";
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
import { DEFAULT_TIMEZONE, formatInTimeZone } from "@/lib/schedule/timezone";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  type ScheduleStatus,
} from "@/lib/schedule/types";
import {
  PLATFORM_LABELS,
  VARIANT_PLATFORMS,
  type VariantPlatform,
} from "@/lib/variants/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Calendar · Precious Promises",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  scheduled: "Scheduled. Nothing sends it — no publishing integration exists.",
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

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

/**
 * The Calendar.
 *
 * Real `scheduled_posts` rows only — there are no sample events anywhere in
 * this product. Times are stored in UTC and displayed in the entry's own zone,
 * defaulting to Europe/London.
 *
 * **Nothing on this page publishes.** A scheduled entry is an intention with a
 * time attached; no worker reads it and no platform integration exists.
 */
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
  const upcoming = upcomingEntries(entries, now, 6);
  const selectedEntry =
    allEntries.find((entry) => entry.post.id === selectedEntryId) ?? null;

  // Only variants whose approval currently holds may be offered. An approval
  // that no longer matches its content is not a schedulable approval.
  const schedulable = reviewRows
    .filter((row) => row.validity === "valid")
    .map((row) => ({
      id: row.variant.id,
      itemTitle: row.item.title,
      platform: row.variant.platform,
      variantType: row.variant.variant_type,
      contentType: row.item.content_type,
    }));

  const monthHref = (value: string) => `/dashboard/calendar?month=${value}`;

  return (
    <DashboardShell
      title="Calendar"
      pathname="/dashboard/calendar"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              Calendar
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
              Approved content with a time against it. Times are stored in UTC
              and shown in {timeZone}. Nothing here sends anything.
            </p>
          </div>
          {notice && NOTICES[notice] ? (
            <p
              role="status"
              className="rounded-lg border border-edge-strong/70 bg-panel-raised/60 px-3 py-1.5 text-xs text-ink-secondary"
            >
              {NOTICES[notice]}
            </p>
          ) : null}
        </div>

        <SectionCard
          title={grid.label}
          description={
            entries.length === 0
              ? "Nothing scheduled in view."
              : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} in view.`
          }
          action={
            <span className="flex gap-2">
              <Link
                href={monthHref(shiftMonth(year, month, -1))}
                className="rounded-lg border border-edge px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Previous
              </Link>
              <Link
                href={monthHref(shiftMonth(year, month, 1))}
                className="rounded-lg border border-edge px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Next
              </Link>
            </span>
          }
        >
          <form
            method="get"
            action="/dashboard/calendar"
            className="mb-4 flex flex-wrap items-end gap-3"
          >
            <input
              type="hidden"
              name="month"
              value={`${year}-${String(month).padStart(2, "0")}`}
            />
            <div>
              <label
                htmlFor="platform"
                className="mb-1 block text-xs font-medium text-ink-secondary"
              >
                Platform
              </label>
              <select
                id="platform"
                name="platform"
                defaultValue={filters.platform ?? ""}
                className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-1.5 text-sm text-ink-primary outline-none focus-visible:border-highlight"
              >
                <option value="">All</option>
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
                className="mb-1 block text-xs font-medium text-ink-secondary"
              >
                Content type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={filters.contentType ?? ""}
                className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-1.5 text-sm text-ink-primary outline-none focus-visible:border-highlight"
              >
                <option value="">All</option>
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
                className="mb-1 block text-xs font-medium text-ink-secondary"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={filters.status ?? ""}
                className="rounded-lg border border-edge bg-panel-raised/50 px-3 py-1.5 text-sm text-ink-primary outline-none focus-visible:border-highlight"
              >
                <option value="">All</option>
                {SCHEDULE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {SCHEDULE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-1.5 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Apply
            </button>
          </form>

          <MonthGrid grid={grid} timeZone={timeZone} />
        </SectionCard>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <SectionCard
            title="Upcoming"
            description="Active schedules, soonest first."
            className="xl:col-span-2"
          >
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nothing scheduled. Approve a variant, then give it a time.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((entry) => (
                  <li
                    key={entry.post.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3"
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
                        )}{" "}
                        ({entry.post.timezone})
                      </span>
                    </span>
                    <StatusBadge tone="inactive">
                      {SCHEDULE_STATUS_LABELS[entry.post.status]}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}

            {selectedEntry ? (
              <div className="mt-4 rounded-lg border border-edge bg-panel-raised/40 px-3.5 py-3">
                <p className="text-sm font-medium text-ink-primary">
                  {selectedEntry.item.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {PLATFORM_LABELS[selectedEntry.variant.platform]} ·{" "}
                  {formatInTimeZone(
                    new Date(selectedEntry.post.scheduled_for),
                    selectedEntry.post.timezone,
                  )}{" "}
                  · {SCHEDULE_STATUS_LABELS[selectedEntry.post.status]}
                </p>

                {selectedEntry.post.pause_reason ? (
                  <p className="mt-2 text-xs text-gold">
                    Paused: {selectedEntry.post.pause_reason}
                  </p>
                ) : null}
                {selectedEntry.post.cancellation_reason ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    Cancelled: {selectedEntry.post.cancellation_reason}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href={`/dashboard/content/${selectedEntry.item.id}`}
                    className="text-xs text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
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
                        className="text-xs text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                      >
                        Reinstate (needs a current approval)
                      </button>
                    </form>
                  ) : null}

                  {selectedEntry.post.status !== "cancelled" ? (
                    <form action={cancelSchedule} className="flex gap-2">
                      <input
                        type="hidden"
                        name="scheduled_post_id"
                        value={selectedEntry.post.id}
                      />
                      <input
                        type="text"
                        name="reason"
                        placeholder="Reason"
                        maxLength={2000}
                        className="rounded border border-edge bg-panel-raised/50 px-2 py-1 text-xs text-ink-primary outline-none focus-visible:border-highlight"
                      />
                      <button
                        type="submit"
                        className="text-xs text-ink-secondary underline underline-offset-2 transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                      >
                        Cancel schedule
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Schedule content"
            description="Approved variants only."
          >
            <ScheduleForm
              variants={schedulable}
              selectedVariantId={selectedVariantId}
              timezone={timeZone}
            />
          </SectionCard>
        </div>

        <SectionCard
          title="Schedule settings"
          description={`Recurring slots and the default timezone (${timeZone}).`}
          action={
            <span className="flex items-center gap-2 text-xs text-ink-muted">
              <CalendarDays aria-hidden="true" className="size-3.5" />
              Founder edition
            </span>
          }
        >
          <RecurringRules rules={rules} now={now} />
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
