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

  it("links only to the areas that exist", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    // One link per built route, and no others — the count is the guard.
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      DASHBOARD_PATH,
      "/dashboard/production",
      "/dashboard/content",
      "/dashboard/scripture",
      "/dashboard/scripts",
      "/dashboard/captions",
      "/dashboard/video",
      "/dashboard/media",
      "/dashboard/calendar",
      "/dashboard/approvals",
      "/dashboard/publish",
      "/dashboard/accounts",
    ]);
  });

  it("does not render unbuilt modules as links", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    // A link to a non-existent route is the failure this guards against.
    for (const label of ["Growth Centre", "Analytics", "Settings"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });

  it("marks unbuilt modules as unavailable for assistive technology", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    const row = screen.getByText("Analytics").closest("[aria-disabled]");
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("aria-disabled", "true");
    expect(row?.textContent).toContain("coming soon");
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
  it("reports the platform as not connected", () => {
    render(<PlatformStatus name="YouTube" icon={TestIcon} />);

    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("disables Connect, because no OAuth flow exists", () => {
    render(<PlatformStatus name="YouTube" icon={TestIcon} />);

    expect(screen.getByRole("button", { name: /Connect/ })).toBeDisabled();
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
