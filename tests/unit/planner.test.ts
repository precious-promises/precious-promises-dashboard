// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildPlannerRecommendations,
  recommendationAbsenceReason,
} from "@/lib/planner/recommendations";
import {
  buildPlannerViews,
  OPEN_PLANNER_STATUSES,
  openTopicCounts,
  PLANNER_PRIORITY_LABELS,
  PLANNER_PRIORITIES,
  PLANNER_STATUS_LABELS,
  PLANNER_STATUSES,
  type PlannerItem,
} from "@/lib/planner/types";

/**
 * The Content Planner: intent, not scheduling — and recommendations that
 * exist only where Stage 10's evidence machinery genuinely supports them.
 */

function item(overrides: Partial<PlannerItem>): PlannerItem {
  return {
    id: "p1",
    owner_id: "owner",
    title: "A plan",
    topic: null,
    content_type: null,
    target_platforms: [],
    target_date: null,
    priority: "normal",
    status: "idea",
    series: null,
    notes: null,
    content_item_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-08-15T09:00:00Z");

describe("planner vocabulary", () => {
  it("labels every status and priority", () => {
    for (const status of PLANNER_STATUSES) {
      expect(PLANNER_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const priority of PLANNER_PRIORITIES) {
      expect(PLANNER_PRIORITY_LABELS[priority]).toBeTruthy();
    }
  });

  it("has no status that names scheduling or publishing", () => {
    for (const status of PLANNER_STATUSES) {
      expect(status).not.toMatch(/schedul|publish|posted/);
    }
  });

  it("treats idea, planned and in_production as open intent", () => {
    expect([...OPEN_PLANNER_STATUSES]).toEqual([
      "idea",
      "planned",
      "in_production",
    ]);
  });
});

describe("planner views", () => {
  it("splits backlog, this week, upcoming and closed correctly", () => {
    const items = [
      item({ id: "backlog", target_date: null }),
      item({ id: "week", target_date: "2026-08-18" }),
      item({ id: "later", target_date: "2026-09-10" }),
      item({ id: "done", status: "done", target_date: "2026-08-18" }),
      item({ id: "dropped", status: "dropped" }),
    ];

    const views = buildPlannerViews(items, NOW);

    expect(views.backlog.map((entry) => entry.id)).toEqual(["backlog"]);
    expect(views.thisWeek.map((entry) => entry.id)).toEqual(["week"]);
    expect(views.upcoming.map((entry) => entry.id)).toEqual(["later"]);
    expect(views.closed.map((entry) => entry.id)).toEqual(["done", "dropped"]);
  });

  it("groups open items by topic and platform", () => {
    const items = [
      item({ id: "a", topic: "Peace", target_platforms: ["youtube"] }),
      item({
        id: "b",
        topic: "Peace",
        target_platforms: ["youtube", "tiktok"],
      }),
      item({ id: "c", topic: "  ", target_platforms: [] }),
      item({ id: "d", topic: "Peace", status: "dropped" }),
    ];

    const views = buildPlannerViews(items, NOW);
    expect(views.byTopic.get("Peace")?.map((entry) => entry.id)).toEqual([
      "a",
      "b",
    ]);
    expect(views.byPlatform.get("youtube")?.length).toBe(2);
    expect(views.byPlatform.get("tiktok")?.length).toBe(1);

    const counts = openTopicCounts(items);
    expect(counts.get("Peace")).toBe(2);
  });
});

describe("recommendations never outrun the evidence", () => {
  it("produces nothing at all when nothing has been measured", () => {
    const recommendations = buildPlannerRecommendations({
      posts: [],
      measuredCount: 0,
      plannedTopicCounts: new Map(),
    });

    expect(recommendations).toEqual([]);
  });

  it("explains each absence in terms of what is actually missing", () => {
    expect(
      recommendationAbsenceReason({ publishedCount: 0, measuredCount: 0 }),
    ).toMatch(/Nothing has been published/);
    expect(
      recommendationAbsenceReason({ publishedCount: 3, measuredCount: 0 }),
    ).toMatch(/no analytics have been fetched/);
    expect(
      recommendationAbsenceReason({ publishedCount: 3, measuredCount: 3 }),
    ).toMatch(/no pattern strong enough/);
  });

  it("never phrases generic advice into an absence", () => {
    for (const reason of [
      recommendationAbsenceReason({ publishedCount: 0, measuredCount: 0 }),
      recommendationAbsenceReason({ publishedCount: 3, measuredCount: 0 }),
      recommendationAbsenceReason({ publishedCount: 3, measuredCount: 3 }),
    ]) {
      expect(reason).not.toMatch(/best practice|experts|studies show/i);
    }
  });
});

describe("the planner is not the schedule", () => {
  it("keeps every planner module away from scheduling tables", () => {
    const files = [
      ...readdirSync(join(process.cwd(), "src/lib/planner"), {
        encoding: "utf8",
      }).map((file) => join("src/lib/planner", file)),
      ...readdirSync(join(process.cwd(), "src/app/dashboard/planner"), {
        encoding: "utf8",
      }).map((file) => join("src/app/dashboard/planner", file)),
    ].filter((file) => /\.tsx?$/.test(file));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      for (const table of [
        "scheduled_posts",
        "recurring_schedule_rules",
        "publish_attempts",
        "content_approvals",
      ]) {
        expect(contents, `${file} touches ${table}`).not.toContain(table);
      }
    }
  });

  it("says in the vocabulary that a planner item is not a scheduled post", () => {
    const contents = readFileSync(
      join(process.cwd(), "src/lib/planner/types.ts"),
      "utf8",
    );
    expect(contents).toMatch(/planner item is not a scheduled post/i);
  });
});
