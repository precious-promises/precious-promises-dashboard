"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  buildMonthGrid,
  parseMonthParam,
  shiftMonth,
} from "@/lib/schedule/calendar";
import type { ScheduleEntry } from "@/lib/schedule/repository";
import { isoDateInTimeZone } from "@/lib/schedule/timezone";
import styles from "./overview.module.css";

/** Read-only navigation. Dots are generated only from stored scheduled rows. */
export function OverviewCalendar({
  now,
  timezone,
  entries,
}: {
  now: string;
  timezone: string;
  entries: ScheduleEntry[];
}) {
  const [month, setMonth] = useState<string | null>(null);
  const current = parseMonthParam(month, new Date(now), timezone);
  const grid = buildMonthGrid(current.year, current.month, timezone, entries);
  const today = isoDateInTimeZone(new Date(now), timezone);
  return (
    <div>
      <div className={styles.calendarHeading}>
        <strong>{grid.label}</strong>
        <div>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setMonth(shiftMonth(current.year, current.month, -1))
            }
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Show current month"
            onClick={() => setMonth(null)}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(current.year, current.month, 1))}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div
        className={styles.calendar}
        aria-label={`${grid.label} scheduled content`}
      >
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <span key={i} className={styles.weekday}>
            {day}
          </span>
        ))}
        {grid.days.map((day) => (
          <Link
            key={day.isoDate}
            href={`/dashboard/calendar?month=${day.isoDate.slice(0, 7)}`}
            aria-label={`${day.isoDate}: ${day.entries.length} scheduled`}
            aria-current={day.isoDate === today ? "date" : undefined}
            data-outside={!day.inMonth || undefined}
          >
            <span>{day.dayOfMonth}</span>
            {day.entries.length > 0 ? <i aria-hidden="true" /> : null}
          </Link>
        ))}
      </div>
      <p className={styles.footnote}>
        <span className={styles.scheduleDot} /> Scheduled{" "}
        <span className={styles.zone}>{timezone}</span>
      </p>
    </div>
  );
}
