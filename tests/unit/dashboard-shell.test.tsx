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

  it("links only to the one area that exists", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Dashboard");
    expect(links[0]).toHaveAttribute("href", DASHBOARD_PATH);
  });

  it("does not render unbuilt modules as links", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    // A link to a non-existent route is the failure this guards against.
    for (const label of ["Scripture Studio", "Analytics", "Settings"]) {
      expect(screen.queryByRole("link", { name: label })).toBeNull();
    }
  });

  it("marks unbuilt modules as unavailable for assistive technology", () => {
    render(<SidebarNav pathname={DASHBOARD_PATH} />);

    const row = screen.getByText("Scripture Studio").closest("[aria-disabled]");
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
  it("shows the approved workflow with zero counts", () => {
    render(<WorkflowPipeline />);

    const list = screen.getByRole("list", {
      name: "Content production workflow",
    });
    for (const stage of [
      "Plan",
      "Write",
      "Produce",
      "Review",
      "Approve",
      "Schedule",
      "Publish",
    ]) {
      expect(within(list).getByText(stage)).toBeInTheDocument();
    }
    expect(within(list).getAllByText("0")).toHaveLength(7);
  });

  it("says the counts are structural rather than live", () => {
    render(<WorkflowPipeline />);

    expect(screen.getByText(/not a live queue/i)).toBeInTheDocument();
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
