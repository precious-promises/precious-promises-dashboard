import type { ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardOverview } from "@/components/dashboard/overview";
import DashboardError from "@/app/dashboard/error";
import { reading } from "@/lib/analytics/types";
import { dashboardFixture } from "../fixtures/dashboard";
vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

describe("Dashboard overview truth boundaries", () => {
  it("shows unknown analytics as dashes and keeps real zero workflow counts", () => {
    render(<DashboardOverview data={dashboardFixture()} email={null} />);
    const panel = screen
      .getByRole("heading", { name: "Performance Snapshot" })
      .closest("section")!;
    expect(within(panel).getAllByText("—")).toHaveLength(4);
    expect(
      within(panel).getByText(/No measured performance yet/),
    ).toBeInTheDocument();
    expect(screen.getByText("Approval queue is clear.")).toBeInTheDocument();
    expect(screen.getByText("Recorded as posted")).toBeInTheDocument();
    expect(screen.getByText(/not a live check/)).toBeInTheDocument();
  });
  it("retains measurement source and does not replace a measured zero", () => {
    const data = dashboardFixture();
    data.analytics.hasAnyData = true;
    data.analytics.totals.views_or_plays = reading({
      metric: "views_or_plays",
      value: 0,
      source: "manual",
      rawName: "views",
      observedAt: "2026-09-15T12:00:00Z",
      fetchedAt: "2026-09-15T12:00:00Z",
      window: "lifetime",
    });
    render(<DashboardOverview data={data} email={null} />);
    const panel = screen
      .getByRole("heading", { name: "Performance Snapshot" })
      .closest("section")!;
    expect(within(panel).getByText("0")).toBeInTheDocument();
    expect(within(panel).getByText("Entered by hand")).toBeInTheDocument();
  });
  it("never turns an unverified reference into a verified preview", () => {
    const data = dashboardFixture();
    data.latestContent = {
      ...data.latestContent!,
      scripture_reference: "Test reference",
      scripture_verification_status: "unverified",
    };
    render(<DashboardOverview data={data} email={null} />);
    const panel = screen
      .getByRole("heading", { name: "Post Preview" })
      .closest("section")!;
    expect(within(panel).getByText("Unverified")).toBeInTheDocument();
    expect(within(panel).queryByText("Verified")).toBeNull();
  });
  it("keeps the studios navigable without adding an editor to the overview", () => {
    render(<DashboardOverview data={dashboardFixture()} email={null} />);
    expect(screen.getByRole("link", { name: "Video Studio" })).toHaveAttribute(
      "href",
      "/dashboard/video",
    );
    expect(screen.getByRole("link", { name: "Captions" })).toHaveAttribute(
      "href",
      "/dashboard/captions",
    );
    expect(
      screen.queryByRole("button", { name: /publish|approve/i }),
    ).toBeNull();
  });
  it("offers a retry on unavailable reads without exposing raw errors", () => {
    render(
      <DashboardError
        error={new Error("private database detail")}
        reset={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Workspace data is unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("private database detail")).toBeNull();
  });
});
