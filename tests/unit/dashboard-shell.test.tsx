import { render, screen, within } from "@testing-library/react";
import { Circle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { OwnerBadge } from "@/components/dashboard/owner-badge";
import { PlatformStatus } from "@/components/dashboard/platform-status";
import { QuickAction } from "@/components/dashboard/quick-action";
import { WorkflowPipeline } from "@/components/dashboard/workflow-pipeline";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ScripturePanel } from "@/components/dashboard/scripture-panel";
import { allNavItems } from "@/config/navigation";
import { DASHBOARD_PATH } from "@/lib/auth/routes";

/**
 * These render the real components rather than mocking Supabase. The shell is
 * deliberately built so its pieces take plain props, which means the UI can be
 * tested without a session, a database, or a stubbed client.
 */

// A real lucide icon stands in for whichever icon a caller passes, so these
// tests exercise the same component type the app uses.
const TestIcon = Circle;

describe("SidebarNav", () => {
  it("renders every planned area", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    for (const item of allNavItems()) {
      expect(
        screen.getByText(item.label),
        `${item.label} should appear in the sidebar`,
      ).toBeInTheDocument();
    }
  });

  it("links to every area, because all 19 now exist", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    // One link per built route, and no others — the count is the guard.
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      DASHBOARD_PATH,
      "/dashboard/production",
      "/dashboard/content",
      "/dashboard/planner",
      "/dashboard/scripture",
      "/dashboard/scripts",
      "/dashboard/captions",
      "/dashboard/video",
      "/dashboard/media",
      "/dashboard/drive",
      "/dashboard/calendar",
      "/dashboard/approvals",
      "/dashboard/publish",
      "/dashboard/youtube",
      "/dashboard/growth",
      "/dashboard/analytics",
      "/dashboard/accounts",
      "/dashboard/rights",
      "/dashboard/settings",
    ]);
  });

  it("renders the Stage 11 modules as real links", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    for (const label of [
      "Content Planner",
      "YouTube & Playlists",
      "Rights & Licences",
      "Settings",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("has no disabled coming-soon rows left", () => {
    const { container } = render(<SidebarNav pathname={DASHBOARD_PATH} />);

    // The disabled-row rendering still exists for any future unbuilt module,
    // but nothing currently uses it: every area is genuinely built.
    expect(container.querySelector("[aria-disabled='true']")).toBeNull();
  });

  it("marks the current section as the active page", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("labels the navigation landmark", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    expect(
      screen.getByRole("navigation", { name: "Dashboard sections" }),
    ).toBeInTheDocument();
  });
});

describe("OwnerBadge", () => {
  it("shows the owner privately with initials, not an invented person", () => {
    render(<OwnerBadge email="owner@example.com" />);

    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText("DB")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });

  it("falls back to the role when no email is available", () => {
    render(<OwnerBadge email={null} />);

    expect(screen.getByText("Founder & Creator")).toBeInTheDocument();
  });
});

describe("MetricCard", () => {
  it("renders a genuine zero with an explanation", () => {
    render(
      <MetricCard
        label="Content Ready"
        value={0}
        icon={TestIcon}
        note="No content records yet"
      />,
    );

    expect(screen.getByText("Content Ready")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("No content records yet")).toBeInTheDocument();
  });
});

describe("PlatformStatus", () => {
  it("reports a platform with no stored account as not connected", () => {
    render(
      <PlatformStatus
        name="YouTube"
        icon={TestIcon}
        status={null}
        identity={null}
      />,
    );

    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("shows the stored identity only when genuinely connected", () => {
    render(
      <PlatformStatus
        name="YouTube"
        icon={TestIcon}
        status="connected"
        identity="Precious Promises"
      />,
    );

    expect(
      screen.getByText(/Connected · Precious Promises/),
    ).toBeInTheDocument();
  });

  it("reports a rejected authorisation as needing reconnection", () => {
    render(
      <PlatformStatus
        name="Instagram"
        icon={TestIcon}
        status="needs_reconnect"
        identity="@precious"
      />,
    );

    expect(screen.getByText("Reconnection needed")).toBeInTheDocument();
    expect(screen.queryByText(/@precious/)).toBeNull();
  });

  it("links to Connected Accounts rather than pretending to connect here", () => {
    render(
      <PlatformStatus
        name="YouTube"
        icon={TestIcon}
        status={null}
        identity={null}
      />,
    );

    expect(
      screen.getByRole("link", { name: /YouTube connection/ }),
    ).toHaveAttribute("href", "/dashboard/accounts");
  });
});

describe("QuickAction", () => {
  it("renders as a genuinely disabled control, not a fake one", () => {
    render(
      <QuickAction
        label="Create Content"
        description="Start a new content item"
        icon={TestIcon}
      />,
    );

    const button = screen.getByRole("button", { name: /Create Content/ });
    expect(button).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
});

describe("WorkflowPipeline", () => {
  it("shows every workflow stage the board can place work in", () => {
    render(<WorkflowPipeline counts={{}} />);

    const list = screen.getByRole("list", {
      name: "Content production workflow",
    });
    for (const stage of [
      "Plan",
      "Verify Scripture",
      "Write",
      "Produce",
      "Review",
      "Approve",
      "Schedule",
    ]) {
      expect(within(list).getByText(stage)).toBeInTheDocument();
    }
    expect(within(list).getAllByText("0")).toHaveLength(7);
  });

  it("does not offer Publish as a stage", () => {
    // Nothing publishes, so a Publish column would imply a capability the
    // product does not have.
    render(<WorkflowPipeline counts={{}} />);

    const list = screen.getByRole("list", {
      name: "Content production workflow",
    });
    expect(within(list).queryByText("Publish")).toBeNull();
  });

  it("renders the real counts it is given", () => {
    render(<WorkflowPipeline counts={{ write: 3, approve: 1 }} />);

    const list = screen.getByRole("list", {
      name: "Content production workflow",
    });
    expect(within(list).getByText("3")).toBeInTheDocument();
    expect(within(list).getByText("1")).toBeInTheDocument();
  });

  it("says the counts are derived from the records", () => {
    render(<WorkflowPipeline counts={{}} />);

    expect(screen.getByText(/derived from the records/i)).toBeInTheDocument();
  });
});

describe("ScripturePanel", () => {
  it("quotes the verse and reference exactly", () => {
    render(<ScripturePanel />);

    expect(
      screen.getByText(
        /Whereby are given unto us exceeding great and precious promises\.\.\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2 Peter 1:4 KJV")).toBeInTheDocument();
  });
});
