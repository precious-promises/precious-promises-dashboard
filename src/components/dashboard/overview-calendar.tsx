"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
  const [weekOffset, setWeekOffset] = useState(0);
  const today = isoDateInTimeZone(new Date(now), timezone);
  // Calendar dates use UTC arithmetic after converting the actual instant to
  // the workspace's local date. This avoids DST moving a day backwards.
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(
    start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + weekOffset * 7,
  );
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    const isoDate = date.toISOString().slice(0, 10);
    return {
      isoDate,
      date,
      entries: entries.filter(
        (entry) =>
          isoDateInTimeZone(new Date(entry.post.scheduled_for), timezone) ===
          isoDate,
      ),
    };
  });
  const dateLabel = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(date);
  const label = `${dateLabel(days[0].date)} – ${dateLabel(days[6].date)}`;
  return (
    <div>
      <div className={styles.calendarHeading}>
        <strong>{label}</strong>
        <div>
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekOffset((value) => value - 1)}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            aria-label="Show current week"
            onClick={() => setWeekOffset(0)}
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekOffset((value) => value + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <div
        className={styles.calendar}
        aria-label={`${label} scheduled content`}
      >
        {days.map((day) => (
          <Link
            key={day.isoDate}
            href={`/dashboard/calendar?month=${day.isoDate.slice(0, 7)}`}
            aria-label={`${day.isoDate}: ${day.entries.length} scheduled`}
            aria-current={day.isoDate === today ? "date" : undefined}
          >
            <span className={styles.weekday}>
              {new Intl.DateTimeFormat("en-GB", {
                weekday: "short",
                timeZone: "UTC",
              }).format(day.date)}
            </span>
            <strong>{day.date.getUTCDate()}</strong>
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
