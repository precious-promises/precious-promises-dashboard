import Link from "next/link";

import { cn } from "@/lib/utils";
import type { MonthGrid as MonthGridData } from "@/lib/schedule/calendar";
import { formatTimeInTimeZone } from "@/lib/schedule/timezone";
import { PLATFORM_LABELS } from "@/lib/variants/types";

/**
 * The month view.
 *
 * Entries are placed on the day they fall in the **display zone**, and each
 * shows its own time in that zone. An empty day is empty — this calendar has
 * no sample events, and never will.
 */

const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_STYLES: Record<string, string> = {
  scheduled: "border-highlight-dim/60 bg-highlight/10 text-ink-primary",
  paused: "border-gold-dim/50 bg-gold/10 text-gold",
  cancelled: "border-edge-strong/60 bg-panel-raised/40 text-ink-muted",
};

export function MonthGrid({
  grid,
  timeZone,
}: {
  grid: MonthGridData;
  timeZone: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-7 gap-1.5 pb-1.5">
          {WEEKDAY_HEADINGS.map((heading) => (
            <div
              key={heading}
              className="px-1 text-[11px] font-medium tracking-wide text-ink-muted uppercase"
            >
              {heading}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {grid.days.map((day) => (
            <div
              key={day.isoDate}
              className={cn(
                "min-h-24 rounded-lg border px-1.5 py-1.5",
                day.inMonth
                  ? "border-edge/70 bg-panel-raised/30"
                  : "border-edge/40 bg-panel/30",
              )}
            >
              <span
                className={cn(
                  "block text-[11px]",
                  day.inMonth ? "text-ink-secondary" : "text-ink-muted",
                )}
              >
                {day.dayOfMonth}
              </span>

              <ul className="mt-1 flex flex-col gap-1">
                {day.entries.map((entry) => (
                  <li key={entry.post.id}>
                    <Link
                      href={`/dashboard/calendar?entry=${entry.post.id}`}
                      className={cn(
                        "block rounded border px-1.5 py-1 text-[10px] leading-tight transition-colors hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight",
                        STATUS_STYLES[entry.post.status],
                      )}
                    >
                      <span className="block font-medium">
                        {formatTimeInTimeZone(
                          new Date(entry.post.scheduled_for),
                          timeZone,
                        )}{" "}
                        {PLATFORM_LABELS[entry.variant.platform]}
                      </span>
                      <span className="block truncate">{entry.item.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
