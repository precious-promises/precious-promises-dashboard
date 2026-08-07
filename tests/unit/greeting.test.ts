// @vitest-environment node
import { describe, expect, it } from "vitest";

import { greetingFor, greetingPeriodForHour } from "@/lib/greeting";

describe("greetingPeriodForHour", () => {
  it.each([
    [0, "morning"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [15, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"],
  ])("maps hour %i to %s", (hour, expected) => {
    expect(greetingPeriodForHour(hour)).toBe(expected);
  });

  it("wraps hours outside 0–23", () => {
    expect(greetingPeriodForHour(24)).toBe("morning");
    expect(greetingPeriodForHour(-1)).toBe("evening");
  });

  it("falls back rather than letting NaN pick a branch", () => {
    expect(greetingPeriodForHour(Number.NaN)).toBe("morning");
  });
});

describe("greetingFor", () => {
  it("addresses the owner by name", () => {
    expect(greetingFor(14, "Dave")).toBe("Good afternoon, Dave");
  });
});
