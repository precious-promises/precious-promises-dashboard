// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  canSchedule,
  canTransitionSchedule,
  findDuplicateSchedule,
  invalidationPause,
  isActiveSchedule,
  scheduleBlockers,
  type ScheduleContext,
} from "@/lib/schedule/rules";
import {
  parseRecurringRuleForm,
  parseScheduleForm,
  recurringRuleValuesFrom,
  scheduleFormSchema,
  scheduleValuesFrom,
} from "@/lib/schedule/schema";
import { DEFAULT_TIMEZONE } from "@/lib/schedule/timezone";
import { SCHEDULE_STATUSES, SCHEDULE_PRESETS } from "@/lib/schedule/types";

/**
 * Scheduling safety.
 *
 * The rule these hold: **a schedule is only as trustworthy as the approval
 * behind it.** Approval and fingerprint are re-checked on the server at the
 * moment of saving, so a page rendered before an edit cannot smuggle stale
 * content into the calendar.
 */

const NOW = new Date("2026-08-08T12:00:00Z");
const FUTURE = new Date("2026-08-11T18:30:00Z");

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    variant: { review_state: "approved", approval_hash: "a".repeat(64) },
    approvalMatches: true,
    scheduledFor: FUTURE,
    now: NOW,
    ...overrides,
  };
}

describe("scheduling requires a live approval", () => {
  it("allows an approved variant with a matching fingerprint", () => {
    expect(canSchedule(context())).toBe(true);
  });

  it("refuses anything not approved", () => {
    for (const state of ["draft", "ready_for_review", "rejected"] as const) {
      const blockers = scheduleBlockers(
        context({ variant: { review_state: state, approval_hash: null } }),
      );

      expect(
        blockers.map((blocker) => blocker.code),
        state,
      ).toContain("not_approved");
    }
  });

  it("refuses an approval whose content has since changed", () => {
    // The case the fingerprint exists for.
    const blockers = scheduleBlockers(context({ approvalMatches: false }));

    expect(blockers.map((blocker) => blocker.code)).toContain("approval_stale");
    expect(blockers[0]!.message).toMatch(/approving again/i);
  });

  it("does not report both not-approved and stale at once", () => {
    const codes = scheduleBlockers(
      context({
        variant: { review_state: "draft", approval_hash: null },
        approvalMatches: false,
      }),
    ).map((blocker) => blocker.code);

    expect(codes).toContain("not_approved");
    expect(codes).not.toContain("approval_stale");
  });
});

describe("scheduling requires a usable time", () => {
  it("refuses a time that did not parse", () => {
    expect(
      scheduleBlockers(context({ scheduledFor: null })).map((b) => b.code),
    ).toContain("time_invalid");
  });

  it("refuses a time in the past", () => {
    expect(
      scheduleBlockers(
        context({ scheduledFor: new Date("2026-08-01T09:00:00Z") }),
      ).map((b) => b.code),
    ).toContain("time_in_past");
  });

  it("refuses now itself", () => {
    expect(
      scheduleBlockers(context({ scheduledFor: NOW })).map((b) => b.code),
    ).toContain("time_in_past");
  });
});

describe("duplicate detection", () => {
  const existing = [
    {
      id: "post-1",
      platform_variant_id: "variant-1",
      scheduled_for: FUTURE.toISOString(),
      status: "scheduled" as const,
    },
  ];

  it("finds an active schedule for the same variant at the same minute", () => {
    expect(findDuplicateSchedule(existing, "variant-1", FUTURE)).toEqual({
      id: "post-1",
    });
  });

  it("ignores seconds when comparing", () => {
    const offBySeconds = new Date(FUTURE.getTime() + 45_000);

    expect(
      findDuplicateSchedule(existing, "variant-1", offBySeconds),
    ).not.toBeNull();
  });

  it("does not treat a different variant as a duplicate", () => {
    expect(findDuplicateSchedule(existing, "variant-2", FUTURE)).toBeNull();
  });

  it("does not treat a different time as a duplicate", () => {
    const later = new Date(FUTURE.getTime() + 3_600_000);

    expect(findDuplicateSchedule(existing, "variant-1", later)).toBeNull();
  });

  it("ignores cancelled and paused schedules", () => {
    for (const status of ["cancelled", "paused"] as const) {
      expect(
        findDuplicateSchedule(
          [{ ...existing[0]!, status }],
          "variant-1",
          FUTURE,
        ),
        status,
      ).toBeNull();
    }
  });
});

describe("schedule state machine", () => {
  it("offers the lifecycle the worker needs", () => {
    // Stage 6 made the execution states real. Stage 9 added the two incomplete
    // outcomes, which had been named in the database since Stage 6 and held
    // out of this list until a provider could genuinely reach them — TikTok
    // now writes both. Neither can become `posted`, which
    // tests/unit/workflow-safety.test.ts proves.
    expect([...SCHEDULE_STATUSES]).toEqual([
      "scheduled",
      "paused",
      "queued",
      "publishing",
      "posted",
      "failed",
      "cancelled",
      "ready_for_manual_post",
      "uploaded_to_platform_draft",
    ]);
  });

  it("pauses and cancels from scheduled", () => {
    expect(canTransitionSchedule("scheduled", "paused")).toBe(true);
    expect(canTransitionSchedule("scheduled", "cancelled")).toBe(true);
  });

  it("lets a paused schedule be reinstated or cancelled", () => {
    expect(canTransitionSchedule("paused", "scheduled")).toBe(true);
    expect(canTransitionSchedule("paused", "cancelled")).toBe(true);
  });

  it("makes cancellation terminal", () => {
    for (const to of SCHEDULE_STATUSES) {
      expect(canTransitionSchedule("cancelled", to), to).toBe(false);
    }
  });

  it("treats only `scheduled` as active", () => {
    expect(isActiveSchedule("scheduled")).toBe(true);
    expect(isActiveSchedule("paused")).toBe(false);
    expect(isActiveSchedule("cancelled")).toBe(false);
  });
});

describe("pausing on invalidation", () => {
  it("pauses rather than cancels, and records why", () => {
    const update = invalidationPause(
      "Approval invalidated by content change.",
      NOW,
    );

    expect(update.status).toBe("paused");
    expect(update.pause_reason).toMatch(/Approval invalidated/);
    expect(update.paused_at).toBe(NOW.toISOString());
  });
});

describe("schedule form validation", () => {
  const valid = {
    platform_variant_id: "variant-1",
    date: "2026-08-11",
    time: "19:30",
    timezone: "Europe/London",
  };

  it("accepts a complete form", () => {
    expect(parseScheduleForm(valid).success).toBe(true);
  });

  it("defaults the timezone to Europe/London", () => {
    const formData = new FormData();
    formData.set("platform_variant_id", "variant-1");
    formData.set("date", "2026-08-11");
    formData.set("time", "19:30");

    const result = parseScheduleForm(scheduleValuesFrom(formData));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe(DEFAULT_TIMEZONE);
    }
  });

  it("rejects an unknown timezone", () => {
    const result = parseScheduleForm({ ...valid, timezone: "Middle/Earth" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.timezone).toBeDefined();
    }
  });

  it("rejects a malformed date or time", () => {
    expect(parseScheduleForm({ ...valid, date: "11/08/2026" }).success).toBe(
      false,
    );
    expect(parseScheduleForm({ ...valid, time: "7:30 pm" }).success).toBe(
      false,
    );
  });

  it("defines no owner_id and no approval_hash", () => {
    // Ownership comes from the session; the fingerprint is recomputed on the
    // server. A hash accepted from a form would let a caller assert that stale
    // content had been approved.
    const fields = Object.keys(scheduleFormSchema.shape);

    expect(fields).not.toContain("owner_id");
    expect(fields).not.toContain("approval_hash");
  });

  it("drops a smuggled owner_id from the FormData reader", () => {
    const formData = new FormData();
    formData.set("platform_variant_id", "variant-1");
    formData.set("date", "2026-08-11");
    formData.set("time", "19:30");
    formData.set("owner_id", "someone-else");
    formData.set("approval_hash", "b".repeat(64));

    const values = scheduleValuesFrom(formData) as object;

    expect(Object.keys(values)).not.toContain("owner_id");
    expect(Object.keys(values)).not.toContain("approval_hash");
  });
});

describe("recurring rule validation", () => {
  const valid = {
    name: "Promise Short",
    platform: "youtube",
    day_of_week: 2,
    local_time: "19:30",
    timezone: "Europe/London",
    enabled: false,
  };

  it("accepts a complete rule", () => {
    expect(parseRecurringRuleForm(valid).success).toBe(true);
  });

  it("rejects a day outside the week", () => {
    for (const day of [-1, 7, 99]) {
      expect(
        parseRecurringRuleForm({ ...valid, day_of_week: day }).success,
        String(day),
      ).toBe(false);
    }
  });

  it("accepts every real day of the week", () => {
    for (let day = 0; day <= 6; day += 1) {
      expect(
        parseRecurringRuleForm({ ...valid, day_of_week: day }).success,
        String(day),
      ).toBe(true);
    }
  });

  it("requires a name", () => {
    expect(parseRecurringRuleForm({ ...valid, name: "  " }).success).toBe(
      false,
    );
  });

  it("rejects an unknown timezone", () => {
    expect(
      parseRecurringRuleForm({ ...valid, timezone: "Middle/Earth" }).success,
    ).toBe(false);
  });

  it("reads a rule out of FormData, defaulting to disabled", () => {
    const formData = new FormData();
    formData.set("name", "Prayer");
    formData.set("platform", "youtube");
    formData.set("day_of_week", "4");
    formData.set("local_time", "19:30");

    const result = parseRecurringRuleForm(recurringRuleValuesFrom(formData));

    expect(result.success).toBe(true);
    if (result.success) {
      // A rule that switched itself on would be a schedule nobody agreed to.
      expect(result.data.enabled).toBe(false);
      expect(result.data.timezone).toBe(DEFAULT_TIMEZONE);
      expect(result.data.content_type).toBeUndefined();
    }
  });
});

describe("the Precious Promises presets", () => {
  it("records the approved rhythm", () => {
    expect(
      SCHEDULE_PRESETS.map((preset) => [
        preset.dayOfWeek,
        preset.localTime,
        preset.name,
      ]),
    ).toEqual([
      [2, "19:30", "Promise Short"],
      [4, "19:30", "Prayer / Declaration"],
      [6, "18:00", "Long-form YouTube"],
      [0, "09:00", "Encouragement Short"],
    ]);
  });

  it("uses Europe/London throughout", () => {
    for (const preset of SCHEDULE_PRESETS) {
      expect(preset.timezone, preset.name).toBe(DEFAULT_TIMEZONE);
    }
  });

  it("is data, not scheduled posts", () => {
    // The presets describe times. Nothing in this module creates a row.
    for (const preset of SCHEDULE_PRESETS) {
      expect(preset).not.toHaveProperty("platform_variant_id");
      expect(preset).not.toHaveProperty("scheduled_for");
    }
  });
});
