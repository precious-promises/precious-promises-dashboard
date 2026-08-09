// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE,
  formatInTimeZone,
  isoDateInTimeZone,
  isoTimeInTimeZone,
  isValidTimeZone,
  offsetMsAt,
  partsInTimeZone,
  weekdayInTimeZone,
  zonedTimeToUtc,
} from "@/lib/schedule/timezone";

/**
 * Time zone handling.
 *
 * Two facts are stored for every schedule: the UTC instant and the zone the
 * owner chose. These tests hold the conversions between them, including the
 * daylight-saving edges — a British summer schedule that drifted by an hour
 * would be wrong for five months of the year before anyone noticed.
 */

const HOUR = 3_600_000;

describe("the default", () => {
  it("is Europe/London", () => {
    expect(DEFAULT_TIMEZONE).toBe("Europe/London");
  });

  it("is a zone the runtime recognises", () => {
    expect(isValidTimeZone(DEFAULT_TIMEZONE)).toBe(true);
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    for (const zone of ["Europe/London", "UTC", "America/New_York"]) {
      expect(isValidTimeZone(zone), zone).toBe(true);
    }
  });

  it("rejects anything else", () => {
    for (const zone of ["", "  ", "Middle/Earth", "GMT+1:00", null, 7]) {
      expect(isValidTimeZone(zone), String(zone)).toBe(false);
    }
  });
});

describe("offsetMsAt", () => {
  it("is zero for UTC", () => {
    expect(offsetMsAt(new Date("2026-08-08T12:00:00Z"), "UTC")).toBe(0);
  });

  it("is +1 hour in London during British Summer Time", () => {
    expect(offsetMsAt(new Date("2026-08-08T12:00:00Z"), "Europe/London")).toBe(
      HOUR,
    );
  });

  it("is zero in London in winter", () => {
    expect(offsetMsAt(new Date("2026-01-08T12:00:00Z"), "Europe/London")).toBe(
      0,
    );
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a summer London wall time to the right instant", () => {
    // 19:30 BST is 18:30 UTC.
    const instant = zonedTimeToUtc("2026-08-11", "19:30", "Europe/London");

    expect(instant?.toISOString()).toBe("2026-08-11T18:30:00.000Z");
  });

  it("converts a winter London wall time to the right instant", () => {
    // 19:30 GMT is 19:30 UTC.
    const instant = zonedTimeToUtc("2026-01-13", "19:30", "Europe/London");

    expect(instant?.toISOString()).toBe("2026-01-13T19:30:00.000Z");
  });

  it("keeps the same wall time across the spring clock change", () => {
    // The whole point of storing the zone: the owner asked for 19:30 local,
    // and it stays 19:30 local on both sides of the change.
    const before = zonedTimeToUtc("2026-03-25", "19:30", "Europe/London")!;
    const after = zonedTimeToUtc("2026-04-01", "19:30", "Europe/London")!;

    expect(isoTimeInTimeZone(before, "Europe/London")).toBe("19:30");
    expect(isoTimeInTimeZone(after, "Europe/London")).toBe("19:30");
    // A naive "add seven days in UTC" would have produced the same instant
    // offset; these differ by an hour because the offset changed.
    expect(after.getTime() - before.getTime()).toBe(7 * 24 * HOUR - HOUR);
  });

  it("treats a UTC wall time as itself", () => {
    expect(zonedTimeToUtc("2026-08-11", "07:00", "UTC")?.toISOString()).toBe(
      "2026-08-11T07:00:00.000Z",
    );
  });

  it("handles a zone behind UTC", () => {
    // 09:00 in New York during summer is 13:00 UTC.
    expect(
      zonedTimeToUtc("2026-08-11", "09:00", "America/New_York")?.toISOString(),
    ).toBe("2026-08-11T13:00:00.000Z");
  });

  it("rejects a malformed date or time rather than guessing", () => {
    expect(zonedTimeToUtc("11-08-2026", "19:30", "Europe/London")).toBeNull();
    expect(zonedTimeToUtc("2026-08-11", "7:30pm", "Europe/London")).toBeNull();
    expect(zonedTimeToUtc("2026-08-11", "25:00", "Europe/London")).toBeNull();
    expect(zonedTimeToUtc("2026-13-11", "19:30", "Europe/London")).toBeNull();
  });

  it("rejects an unknown timezone", () => {
    expect(zonedTimeToUtc("2026-08-11", "19:30", "Middle/Earth")).toBeNull();
  });

  it("resolves a nonexistent local time to a real instant rather than failing silently", () => {
    // 01:30 on the spring-forward morning does not exist in London.
    const instant = zonedTimeToUtc("2026-03-29", "01:30", "Europe/London");

    expect(instant).not.toBeNull();
    expect(Number.isNaN(instant!.getTime())).toBe(false);
  });
});

describe("reading an instant back", () => {
  it("reports the date in the display zone, not in UTC", () => {
    // 23:30 UTC is already the next day in London during summer.
    const instant = new Date("2026-08-11T23:30:00Z");

    expect(isoDateInTimeZone(instant, "UTC")).toBe("2026-08-11");
    expect(isoDateInTimeZone(instant, "Europe/London")).toBe("2026-08-12");
  });

  it("reports the wall-clock time in the zone", () => {
    expect(
      isoTimeInTimeZone(new Date("2026-08-11T18:30:00Z"), "Europe/London"),
    ).toBe("19:30");
  });

  it("reports the weekday in the zone, Sunday as 0", () => {
    // 2026-08-11 is a Tuesday.
    expect(
      weekdayInTimeZone(new Date("2026-08-11T18:30:00Z"), "Europe/London"),
    ).toBe(2);
  });

  it("breaks an instant into its parts", () => {
    const parts = partsInTimeZone(
      new Date("2026-08-11T18:30:00Z"),
      "Europe/London",
    );

    expect(parts).toMatchObject({
      year: 2026,
      month: 8,
      day: 11,
      hour: 19,
      minute: 30,
    });
  });

  it("round-trips a wall time through UTC and back", () => {
    for (const date of ["2026-01-13", "2026-06-13", "2026-10-30"]) {
      const instant = zonedTimeToUtc(date, "07:45", "Europe/London")!;

      expect(isoTimeInTimeZone(instant, "Europe/London"), date).toBe("07:45");
      expect(isoDateInTimeZone(instant, "Europe/London"), date).toBe(date);
    }
  });
});

describe("formatting", () => {
  it("renders a readable instant in the zone", () => {
    const formatted = formatInTimeZone(
      new Date("2026-08-11T18:30:00Z"),
      "Europe/London",
    );

    expect(formatted).toContain("19:30");
    expect(formatted).toContain("2026");
  });

  it("returns an empty string for an unusable zone rather than throwing", () => {
    expect(formatInTimeZone(new Date(), "Middle/Earth")).toBe("");
  });
});
