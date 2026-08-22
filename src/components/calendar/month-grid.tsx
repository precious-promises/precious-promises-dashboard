import { CalendarClock } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { MonthGrid as MonthGridData } from "@/lib/schedule/calendar";
import {
  formatTimeInTimeZone,
  isoDateInTimeZone,
} from "@/lib/schedule/timezone";
import { PLATFORM_LABELS } from "@/lib/variants/types";

/**
 * Premium month view backed only by real schedule rows.
 *
 * Entries are placed on the day they fall in the display zone. Empty days stay
 * empty: the calendar never invents sample events to make the interface look
 * populated.
 */

const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLES: Record<string, string> = {
  scheduled:
    "border-highlight-dim/70 bg-highlight/10 text-ink-primary hover:bg-highlight/15",
  paused: "border-gold-dim/60 bg-gold/10 text-gold hover:bg-gold/15",
  cancelled:
    "border-edge-strong/60 bg-panel-raised/45 text-ink-muted hover:bg-panel-hover/60",
};

const PLATFORM_MARKERS: Record<string, string> = {
  youtube: "YT",
  instagram: "IG",
  tiktok: "TT",
};

export function MonthGrid({
  grid,
  timeZone,
  now = new Date(),
}: {
  grid: MonthGridData;
  timeZone: string;
  now?: Date;
}) {
  const today = isoDateInTimeZone(now, timeZone);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[50rem]">
        <div className="grid grid-cols-7 border-x border-t border-edge/70 bg-panel-raised/20">
          {WEEKDAY_HEADINGS.map((heading) => (
            <div
              key={heading}
              className="border-r border-edge/60 px-3 py-2.5 text-[11px] font-semibold tracking-[0.16em] text-ink-muted uppercase last:border-r-0"
            >
              {heading}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 border-l border-t border-edge/70">
          {grid.days.map((day) => {
            const isToday = day.isoDate === today;
            return (
              <div
                key={day.isoDate}
                className={cn(
                  "min-h-36 border-r border-b border-edge/70 p-2.5 transition-colors",
                  day.inMonth
                    ? "bg-panel-raised/25"
                    : "bg-panel/35 text-ink-muted",
                  isToday && "bg-highlight/[0.055]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                      isToday
                        ? "bg-highlight text-ink shadow-[0_0_18px_rgba(92,225,230,0.22)]"
                        : day.inMonth
                          ? "text-ink-secondary"
                          : "text-ink-muted",
                    )}
                  >
                    {day.dayOfMonth}
                  </span>
                  {day.entries.length > 0 ? (
                    <span className="text-[10px] font-medium text-ink-muted">
                      {day.entries.length}{" "}
                      {day.entries.length === 1 ? "post" : "posts"}
                    </span>
                  ) : null}
                </div>

                <ul className="mt-2 flex flex-col gap-1.5">
                  {day.entries.map((entry) => (
                    <li key={entry.post.id}>
                      <Link
                        href={`/dashboard/calendar?entry=${entry.post.id}&month=${grid.year}-${String(grid.month).padStart(2, "0")}`}
                        className={cn(
                          "group block rounded-lg border px-2 py-1.5 text-[10px] leading-tight transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight",
                          STATUS_STYLES[entry.post.status],
                        )}
                      >
                        <span className="flex items-center justify-between gap-2 font-semibold">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <CalendarClock
                              aria-hidden="true"
                              className="size-3 shrink-0 opacity-75"
                            />
                            <span>
                              {formatTimeInTimeZone(
                                new Date(entry.post.scheduled_for),
                                timeZone,
                              )}
                            </span>
                          </span>
                          <span className="rounded border border-current/15 bg-black/10 px-1 py-0.5 text-[9px] tracking-wide opacity-80">
                            {PLATFORM_MARKERS[entry.variant.platform] ??
                              PLATFORM_LABELS[entry.variant.platform]}
                          </span>
                        </span>
                        <span className="mt-1 block truncate font-medium">
                          {entry.item.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
