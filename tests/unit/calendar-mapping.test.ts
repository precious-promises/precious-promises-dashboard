// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  applyFilters,
  buildMonthGrid,
  NO_FILTERS,
  parseMonthParam,
  shiftMonth,
} from "@/lib/schedule/calendar";
import { nextOccurrences, matchesSlot } from "@/lib/schedule/recurrence";
import type { ScheduleEntry } from "@/lib/schedule/repository";
import type {
  RecurringScheduleRule,
  ScheduledPost,
} from "@/lib/schedule/types";

/**
 * Calendar mapping and recurrence.
 *
 * The mapping rule that matters: **days are computed in the display zone.** A
 * post at 23:30 UTC belongs to the next day in London for half the year, and a
 * calendar that used UTC would be quietly wrong for months.
 *
 * There are no sample events anywhere here. An empty day is an empty day.
 */

function entry(
  id: string,
  scheduledFor: string,
  overrides: {
    status?: ScheduledPost["status"];
    platform?: "youtube" | "instagram" | "tiktok";
    contentType?: string;
  } = {},
): ScheduleEntry {
  return {
    post: {
      id,
      owner_id: "owner-1",
      platform_variant_id: `variant-${id}`,
      scheduled_for: scheduledFor,
      timezone: "Europe/London",
      status: overrides.status ?? "scheduled",
      approval_hash: "a".repeat(64),
      recurring_rule_id: null,
      paused_at: null,
      pause_reason: null,
      cancelled_at: null,
      cancellation_reason: null,
      attempt_count: 0,
      claimed_at: null,
      claim_token: null,
      claim_expires_at: null,
      claimed_by: null,
      queued_at: null,
      publishing_started_at: null,
      posted_at: null,
      external_post_id: null,
      external_post_url: null,
      last_error_code: null,
      last_error_message: null,
      outcome_detail: null,
      external_processing_status: null,
      external_processing_checked_at: null,
      created_at: scheduledFor,
      updated_at: scheduledFor,
    },
    variant: {
      id: `variant-${id}`,
      platform: overrides.platform ?? "youtube",
    } as ScheduleEntry["variant"],
    item: {
      id: `item-${id}`,
      title: `Item ${id}`,
      content_type: overrides.contentType ?? "youtube_short",
    } as ScheduleEntry["item"],
  };
}

describe("buildMonthGrid", () => {
  it("always returns six Monday-first weeks", () => {
    const grid = buildMonthGrid(2026, 8, "Europe/London", []);

    expect(grid.days).toHaveLength(42);
    expect(grid.label).toContain("August");
    expect(grid.label).toContain("2026");
  });

  it("marks days outside the month", () => {
    const grid = buildMonthGrid(2026, 8, "Europe/London", []);
    const inMonth = grid.days.filter((day) => day.inMonth);

    expect(inMonth).toHaveLength(31);
    expect(inMonth[0]!.isoDate).toBe("2026-08-01");
    expect(inMonth.at(-1)!.isoDate).toBe("2026-08-31");
  });

  it("places an entry on its day in the display zone, not in UTC", () => {
    // 23:30 UTC on the 11th is 00:30 on the 12th in London.
    const grid = buildMonthGrid(2026, 8, "Europe/London", [
      entry("a", "2026-08-11T23:30:00Z"),
    ]);

    const eleventh = grid.days.find((day) => day.isoDate === "2026-08-11")!;
    const twelfth = grid.days.find((day) => day.isoDate === "2026-08-12")!;

    expect(eleventh.entries).toHaveLength(0);
    expect(twelfth.entries).toHaveLength(1);
  });

  it("orders several entries on one day by time", () => {
    const grid = buildMonthGrid(2026, 8, "Europe/London", [
      entry("late", "2026-08-11T18:30:00Z"),
      entry("early", "2026-08-11T08:00:00Z"),
    ]);

    const day = grid.days.find((cell) => cell.isoDate === "2026-08-11")!;

    expect(day.entries.map((item) => item.post.id)).toEqual(["early", "late"]);
  });

  it("invents nothing for an empty month", () => {
    const grid = buildMonthGrid(2026, 8, "Europe/London", []);

    expect(grid.days.every((day) => day.entries.length === 0)).toBe(true);
  });
});

describe("filters", () => {
  const entries = [
    entry("a", "2026-08-11T18:30:00Z", { platform: "youtube" }),
    entry("b", "2026-08-12T18:30:00Z", {
      platform: "instagram",
      contentType: "instagram_reel",
    }),
    entry("c", "2026-08-13T18:30:00Z", { status: "cancelled" }),
  ];

  it("returns everything with no filters", () => {
    expect(applyFilters(entries, NO_FILTERS)).toHaveLength(3);
  });

  it("filters by platform", () => {
    expect(
      applyFilters(entries, { ...NO_FILTERS, platform: "instagram" }),
    ).toHaveLength(1);
  });

  it("filters by content type", () => {
    expect(
      applyFilters(entries, { ...NO_FILTERS, contentType: "instagram_reel" }),
    ).toHaveLength(1);
  });

  it("filters by status", () => {
    expect(
      applyFilters(entries, { ...NO_FILTERS, status: "cancelled" }),
    ).toHaveLength(1);
  });

  it("combines filters", () => {
    expect(
      applyFilters(entries, {
        platform: "youtube",
        contentType: "youtube_short",
        status: "scheduled",
      }),
    ).toHaveLength(1);
  });
});

describe("month navigation", () => {
  it("reads a YYYY-MM parameter", () => {
    expect(parseMonthParam("2026-03", new Date(), "UTC")).toEqual({
      year: 2026,
      month: 3,
    });
  });

  it("falls back to the month containing the given instant", () => {
    expect(
      parseMonthParam(null, new Date("2026-08-11T12:00:00Z"), "Europe/London"),
    ).toEqual({ year: 2026, month: 8 });
  });

  it("ignores a malformed or impossible month", () => {
    for (const value of ["2026-13", "August", "26-08"]) {
      expect(
        parseMonthParam(value, new Date("2026-08-11T12:00:00Z"), "UTC"),
        value,
      ).toEqual({ year: 2026, month: 8 });
    }
  });

  it("shifts across year boundaries", () => {
    expect(shiftMonth(2026, 1, -1)).toBe("2025-12");
    expect(shiftMonth(2026, 12, 1)).toBe("2027-01");
  });
});

describe("recurring occurrences", () => {
  const rule: Pick<
    RecurringScheduleRule,
    "day_of_week" | "local_time" | "timezone" | "enabled"
  > = {
    day_of_week: 2,
    local_time: "19:30:00",
    timezone: "Europe/London",
    enabled: true,
  };

  it("returns nothing at all for a disabled rule", () => {
    // Not a greyed-out list: a rule the owner has not switched on has no
    // occurrences, and showing some would imply the schedule exists.
    expect(nextOccurrences({ ...rule, enabled: false }, new Date(), 4)).toEqual(
      [],
    );
  });

  it("lands on the right weekday at the right local time", () => {
    const occurrences = nextOccurrences(
      rule,
      new Date("2026-08-08T12:00:00Z"),
      3,
    );

    expect(occurrences).toHaveLength(3);
    for (const occurrence of occurrences) {
      // 19:30 BST is 18:30 UTC.
      expect(occurrence.instant.toISOString()).toContain("T18:30:00");
    }
    expect(occurrences[0]!.localDate).toBe("2026-08-11");
    expect(occurrences[1]!.localDate).toBe("2026-08-18");
  });

  it("only returns times in the future", () => {
    const from = new Date("2026-08-11T20:00:00Z");
    const occurrences = nextOccurrences(rule, from, 2);

    for (const occurrence of occurrences) {
      expect(occurrence.instant.getTime()).toBeGreaterThan(from.getTime());
    }
    expect(occurrences[0]!.localDate).toBe("2026-08-18");
  });

  it("keeps the local time across a clock change", () => {
    // Late October crosses the end of British Summer Time.
    const occurrences = nextOccurrences(
      rule,
      new Date("2026-10-20T12:00:00Z"),
      3,
    );

    expect(occurrences[0]!.instant.toISOString()).toContain("T18:30:00");
    // After the change, 19:30 local is 19:30 UTC.
    expect(occurrences.at(-1)!.instant.toISOString()).toContain("T19:30:00");
  });

  it("matches an instant that falls in its slot", () => {
    expect(matchesSlot(rule, new Date("2026-08-11T18:30:00Z"))).toBe(true);
  });

  it("does not match the wrong day or the wrong minute", () => {
    expect(matchesSlot(rule, new Date("2026-08-12T18:30:00Z"))).toBe(false);
    expect(matchesSlot(rule, new Date("2026-08-11T18:31:00Z"))).toBe(false);
  });
});
