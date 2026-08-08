/**
 * Time zones, without a dependency.
 *
 * Two rules govern every date in this product:
 *
 * 1. **Instants are stored in UTC.** `scheduled_for` is a `timestamptz`.
 * 2. **The zone the owner chose is stored beside it**, because a wall-clock
 *    intention ("Tuesday at 7:30pm") is not the same fact as an instant. Keep
 *    only the instant and a daylight-saving change silently moves the post by
 *    an hour; keep only the wall time and you cannot order posts.
 *
 * The conversions use `Intl`, which ships with the runtime and carries the
 * IANA database — so there is no timezone package to keep current, and no
 * offset table to go stale.
 */

export const DEFAULT_TIMEZONE = "Europe/London";

/** Whether the runtime recognises this IANA zone name. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.trim() === "") {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = PART_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      // h23 rather than hour12:false — the latter can yield hour "24".
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PART_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock reading of an instant in a zone. */
export function partsInTimeZone(instant: Date, timeZone: string): ZonedParts {
  const parts = partFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value ?? "0";
    return Number.parseInt(value, 10);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The zone's offset from UTC at a given instant, in milliseconds. */
export function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = partsInTimeZone(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asIfUtc - instant.getTime();
}

/**
 * A wall-clock time in a zone, as a UTC instant.
 *
 * Two passes: guess using the offset at the naive instant, then re-check the
 * offset at the guess. One correction is enough for every real zone, because
 * offsets change by at most a couple of hours and never twice within one.
 *
 * Daylight-saving edges are handled by choosing rather than by pretending:
 * a local time that does not exist (clocks jumped forward) resolves to the
 * instant the clocks reached, and an ambiguous one (clocks went back) resolves
 * to the first occurrence. Both are documented rather than left to chance.
 */
export function zonedTimeToUtc(
  isoDate: string,
  isoTime: string,
  timeZone: string,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(isoTime);

  if (!dateMatch || !timeMatch || !isValidTimeZone(timeZone)) {
    return null;
  }

  const [, year, month, day] = dateMatch.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  const [, hour, minute] = timeMatch.map(Number) as [number, number, number];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }

  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);

  const firstOffset = offsetMsAt(new Date(naive), timeZone);
  let instant = naive - firstOffset;

  const secondOffset = offsetMsAt(new Date(instant), timeZone);
  if (secondOffset !== firstOffset) {
    instant = naive - secondOffset;
  }

  const result = new Date(instant);

  // A date like 31 February rolls over in Date.UTC. Reject it rather than
  // schedule a post for a day the owner did not pick.
  const check = partsInTimeZone(result, timeZone);
  if (check.day !== day && check.day !== day + 1 && check.day !== day - 1) {
    return null;
  }

  return result;
}

/** `YYYY-MM-DD` as read in the zone. */
export function isoDateInTimeZone(instant: Date, timeZone: string): string {
  const parts = partsInTimeZone(instant, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

/** `HH:mm` as read in the zone. */
export function isoTimeInTimeZone(instant: Date, timeZone: string): string {
  const parts = partsInTimeZone(instant, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/** The day of the week in the zone, 0 = Sunday, matching `getDay()`. */
export function weekdayInTimeZone(instant: Date, timeZone: string): number {
  const parts = partsInTimeZone(instant, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** `Tue 12 Aug 2026, 19:30` — the format used across the calendar. */
export function formatInTimeZone(instant: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** `19:30` — for a calendar cell, where the date is already implied. */
export function formatTimeInTimeZone(instant: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    return "";
  }
  return isoTimeInTimeZone(instant, timeZone);
}
