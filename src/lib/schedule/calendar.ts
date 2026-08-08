import type { ContentType } from "@/lib/content/types";
import type { VariantPlatform } from "@/lib/variants/types";

import type { ScheduleEntry } from "./repository";
import { isoDateInTimeZone } from "./timezone";
import type { ScheduleStatus } from "./types";

/**
 * Turning scheduled posts into a month grid.
 *
 * Pure, so the mapping is testable without a database or a browser. Two things
 * it gets right on purpose:
 *
 * - **Days are computed in the display zone**, not in UTC. A post at 00:30 UTC
 *   belongs to the previous day in Europe/London for half the year, and a
 *   calendar that put it on the wrong day would be quietly wrong for months.
 * - **Nothing is invented.** A day with no entries is an empty day. There are
 *   no sample events anywhere in this product.
 */

export interface CalendarFilters {
  platform: VariantPlatform | null;
  contentType: ContentType | null;
  status: ScheduleStatus | null;
}

export const NO_FILTERS: CalendarFilters = {
  platform: null,
  contentType: null,
  status: null,
};

export interface CalendarDay {
  /** `YYYY-MM-DD` in the display zone. */
  isoDate: string;
  dayOfMonth: number;
  inMonth: boolean;
  entries: ScheduleEntry[];
}

export interface MonthGrid {
  year: number;
  month: number;
  label: string;
  days: CalendarDay[];
}

export function applyFilters(
  entries: ScheduleEntry[],
  filters: CalendarFilters,
): ScheduleEntry[] {
  return entries.filter((entry) => {
    if (filters.platform && entry.variant.platform !== filters.platform) {
      return false;
    }
    if (
      filters.contentType &&
      entry.item.content_type !== filters.contentType
    ) {
      return false;
    }
    if (filters.status && entry.post.status !== filters.status) {
      return false;
    }
    return true;
  });
}

function isoOf(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

/**
 * A six-week grid covering the month, Monday-first.
 *
 * Always six weeks so the layout does not jump between months — a grid that
 * changed height would move the controls under it.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  timeZone: string,
  entries: ScheduleEntry[],
): MonthGrid {
  const byDate = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    const key = isoDateInTimeZone(new Date(entry.post.scheduled_for), timeZone);
    const list = byDate.get(key) ?? [];
    list.push(entry);
    byDate.set(key, list);
  }

  const first = new Date(Date.UTC(year, month - 1, 1));
  // Monday-first: JavaScript's Sunday is 0, so shift it to the end.
  const leading = (first.getUTCDay() + 6) % 7;

  const days: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const cell = new Date(Date.UTC(year, month - 1, 1 - leading + index));
    const cellYear = cell.getUTCFullYear();
    const cellMonth = cell.getUTCMonth() + 1;
    const cellDay = cell.getUTCDate();
    const isoDate = isoOf(cellYear, cellMonth, cellDay);

    days.push({
      isoDate,
      dayOfMonth: cellDay,
      inMonth: cellMonth === month && cellYear === year,
      entries: (byDate.get(isoDate) ?? []).sort(
        (a, b) =>
          new Date(a.post.scheduled_for).getTime() -
          new Date(b.post.scheduled_for).getTime(),
      ),
    });
  }

  return {
    year,
    month,
    label: new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(first),
    days,
  };
}

/** `2026-08` → `{ year, month }`, or the month containing `fallback`. */
export function parseMonthParam(
  value: string | null,
  fallback: Date,
  timeZone: string,
): { year: number; month: number } {
  const match = value ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const iso = isoDateInTimeZone(fallback, timeZone);
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/** The month before or after, as a `YYYY-MM` parameter. */
export function shiftMonth(year: number, month: number, delta: number): string {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}
