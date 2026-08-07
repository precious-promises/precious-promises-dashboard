// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  allNavItems,
  NAVIGATION,
  sectionTitleForPath,
} from "@/config/navigation";
import { DASHBOARD_PATH } from "@/lib/auth/routes";

/** The 19 areas approved for Stage 1, in order. */
const EXPECTED_LABELS = [
  "Dashboard",
  "Production Board",
  "Content Library",
  "Content Planner",
  "Scripture Studio",
  "Script Studio",
  "Caption Studio",
  "Video Creation Studio",
  "Media Assets",
  "Google Drive Browser",
  "Calendar",
  "Approval Queue",
  "Publish Queue",
  "YouTube & Playlists",
  "Growth Centre",
  "Analytics",
  "Connected Accounts",
  "Rights & Licences",
  "Settings",
];

describe("navigation configuration", () => {
  it("represents all 19 planned areas, in order", () => {
    expect(allNavItems().map((item) => item.label)).toEqual(EXPECTED_LABELS);
  });

  it("groups them under the approved headings", () => {
    expect(NAVIGATION.map((group) => group.label)).toEqual([
      null,
      "Content",
      "Create",
      "Media",
      "Publish",
      "Grow",
      "System",
    ]);
  });

  it("gives every item a unique id", () => {
    const ids = allNavItems().map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks Dashboard as the only available area", () => {
    const available = allNavItems().filter(
      (item) => item.status === "available",
    );

    expect(available).toHaveLength(1);
    expect(available[0]?.label).toBe("Dashboard");
    expect(available[0]?.href).toBe(DASHBOARD_PATH);
  });

  it("gives no href to any unbuilt module", () => {
    // This is the guard that makes a broken link impossible: a coming-soon
    // item has nowhere to point, so it cannot be rendered as a link.
    for (const item of allNavItems()) {
      if (item.status === "coming-soon") {
        expect(item.href, `${item.label} must not be linkable`).toBeUndefined();
      }
    }
  });

  it("gives every available item an href", () => {
    for (const item of allNavItems()) {
      if (item.status === "available") {
        expect(item.href, `${item.label} must be linkable`).toBeDefined();
      }
    }
  });

  it("gives every item an icon", () => {
    for (const item of allNavItems()) {
      expect(item.icon, `${item.label} needs an icon`).toBeDefined();
    }
  });
});

describe("sectionTitleForPath", () => {
  it("names the dashboard section", () => {
    expect(sectionTitleForPath(DASHBOARD_PATH)).toBe("Dashboard");
  });

  it("falls back to Dashboard for an unknown path", () => {
    expect(sectionTitleForPath("/nowhere")).toBe("Dashboard");
  });
});
