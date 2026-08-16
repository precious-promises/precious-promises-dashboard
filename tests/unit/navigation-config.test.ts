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

  it("marks exactly the built areas as available — now all 19", () => {
    // Stage 1 had only Dashboard; Stage 2 added Content Library and Media
    // Assets; Stage 3 added the three writing studios; Stage 4 added the Video
    // Creation Studio; Stage 5 added the Production Board, Calendar and
    // Approval Queue; Stage 6 added the Publish Queue; Stage 7 added Connected
    // Accounts; Stage 8 added the Google Drive Browser; Stage 10 added the
    // Growth Centre and Analytics; Stage 11 added the Content Planner, the
    // YouTube & Playlists workspace, Rights & Licences and Settings. This list
    // grew only as each route genuinely came to exist — never to satisfy a
    // target count — and it happens to have reached the full 19.
    const available = allNavItems().filter(
      (item) => item.status === "available",
    );

    expect(available.map((item) => item.label)).toEqual(EXPECTED_LABELS);
    expect(available.find((item) => item.label === "Dashboard")?.href).toBe(
      DASHBOARD_PATH,
    );
  });

  it("leaves nothing unbuilt", () => {
    const comingSoon = allNavItems().filter(
      (item) => item.status === "coming-soon",
    );

    expect(comingSoon).toHaveLength(0);
  });

  it("adds no 20th area for AI assistance", () => {
    // AI drafting lives inside the studios that use it, behind explicit
    // request buttons. A top-level AI area would present generation as a
    // destination of its own, which is exactly what this product avoids.
    expect(allNavItems()).toHaveLength(19);
    for (const item of allNavItems()) {
      expect(item.label.toLowerCase()).not.toContain("ai");
      expect(item.label.toLowerCase()).not.toContain("assistant");
    }
  });

  it("offers the Drive Browser, because Stage 8 built it", () => {
    const drive = allNavItems().find(
      (item) => item.id === "google-drive-browser",
    );

    expect(drive?.status).toBe("available");
    expect(drive?.href).toBe("/dashboard/drive");
  });

  it("offers Connected Accounts, because the route now exists", () => {
    // Stage 7 built a real OAuth flow and a real YouTube adapter, so this is
    // no longer a claim about a capability that does not exist. What the page
    // itself says about publishing stays honest — see the accounts page.
    const connectedAccounts = allNavItems().find(
      (item) => item.id === "connected-accounts",
    );

    expect(connectedAccounts?.status).toBe("available");
    expect(connectedAccounts?.href).toBe("/dashboard/accounts");
  });

  it("offers YouTube & Playlists, because Stage 11 built the workspace", () => {
    // Stage 7's playlist selection lived inside the YouTube settings form,
    // and this test used to insist no separate area existed. Stage 11 built a
    // real workspace — channel identity, playlists from the connected channel,
    // uploads this dashboard recorded — so the area is now genuine.
    const playlists = allNavItems().find(
      (item) => item.id === "youtube-playlists",
    );

    expect(playlists?.status).toBe("available");
    expect(playlists?.href).toBe("/dashboard/youtube");
  });

  it("offers the four Stage 11 areas at their routes", () => {
    const expectations: Record<string, string> = {
      "content-planner": "/dashboard/planner",
      "youtube-playlists": "/dashboard/youtube",
      "rights-licences": "/dashboard/rights",
      settings: "/dashboard/settings",
    };
    for (const [id, href] of Object.entries(expectations)) {
      const item = allNavItems().find((candidate) => candidate.id === id);
      expect(item?.status, id).toBe("available");
      expect(item?.href, id).toBe(href);
    }
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

  it("names the Connected Accounts section", () => {
    expect(sectionTitleForPath("/dashboard/accounts")).toBe(
      "Connected Accounts",
    );
  });

  it("falls back to Dashboard for an unknown path", () => {
    expect(sectionTitleForPath("/nowhere")).toBe("Dashboard");
  });
});
