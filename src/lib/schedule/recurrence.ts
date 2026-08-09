import {
  isoDateInTimeZone,
  partsInTimeZone,
  weekdayInTimeZone,
  zonedTimeToUtc,
} from "./timezone";
import { shortLocalTime, type RecurringScheduleRule } from "./types";

/**
 * Turning a weekly rule into actual instants.
 *
 * A rule says "Tuesday at 19:30 in Europe/London". That is a wall-clock
 * intention, so each occurrence is resolved through the zone individually —
 * adding seven days to a UTC instant would drift by an hour across a
 * daylight-saving boundary and quietly move the slot.
 *
 * **This creates nothing.** It computes when a slot would fall, for display.
 * No scheduled post is written by a rule; a person assigns approved content
 * into a slot.
 */

export interface RuleOccurrence {
  /** The UTC instant of the slot. */
  instant: Date;
  /** The date as read in the rule's own zone, `YYYY-MM-DD`. */
  localDate: string;
}

/** Move a calendar date by whole days, in the zone's own terms. */
function addDaysInZone(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(moved.getUTCFullYear()).padStart(4, "0"),
    String(moved.getUTCMonth() + 1).padStart(2, "0"),
    String(moved.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekdayOfIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The next `count` times this rule falls, from `from` onwards.
 *
 * A disabled rule returns nothing at all — not a greyed-out list. A rule the
 * owner has not switched on has no occurrences, and showing some would imply
 * the schedule exists.
 */
export function nextOccurrences(
  rule: Pick<
    RecurringScheduleRule,
    "day_of_week" | "local_time" | "timezone" | "enabled"
  >,
  from: Date,
  count = 4,
): RuleOccurrence[] {
  if (!rule.enabled || count <= 0) {
    return [];
  }

  const time = shortLocalTime(rule.local_time);
  let cursor = isoDateInTimeZone(from, rule.timezone);

  // Step forward to the first matching weekday.
  const todayWeekday = weekdayOfIsoDate(cursor);
  const ahead = (rule.day_of_week - todayWeekday + 7) % 7;
  cursor = addDaysInZone(cursor, ahead);

  const occurrences: RuleOccurrence[] = [];

  // A bounded loop: at most `count` weeks plus one, so a rule whose first
  // occurrence has already passed today still yields `count` results.
  for (
    let week = 0;
    week < count + 1 && occurrences.length < count;
    week += 1
  ) {
    const localDate = addDaysInZone(cursor, week * 7);
    const instant = zonedTimeToUtc(localDate, time, rule.timezone);

    if (instant !== null && instant.getTime() > from.getTime()) {
      occurrences.push({ instant, localDate });
    }
  }

  return occurrences;
}

/**
 * Whether an instant falls inside a rule's slot, to the minute.
 *
 * Used to mark a scheduled post as sitting in a recurring slot without
 * storing the association twice.
 */
export function matchesSlot(
  rule: Pick<RecurringScheduleRule, "day_of_week" | "local_time" | "timezone">,
  instant: Date,
): boolean {
  if (weekdayInTimeZone(instant, rule.timezone) !== rule.day_of_week) {
    return false;
  }

  const parts = partsInTimeZone(instant, rule.timezone);
  const actual = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

  return actual === shortLocalTime(rule.local_time);
}
