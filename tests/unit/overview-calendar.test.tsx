import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewCalendar } from "@/components/dashboard/overview-calendar";

describe("Overview week navigation", () => {
  it("uses the workspace date across a UTC day boundary and navigates across months", () => {
    render(
      <OverviewCalendar
        now="2026-03-31T23:30:00Z"
        timezone="Europe/London"
        entries={[]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "2026-04-01: 0 scheduled" }),
    ).toHaveAttribute("aria-current", "date");
    expect(
      screen.getByRole("link", { name: "2026-03-30: 0 scheduled" }),
    ).toHaveAttribute("href", "/dashboard/calendar?month=2026-03");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(
      screen.getByRole("link", { name: "2026-04-06: 0 scheduled" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "2026-04-01: 0 scheduled" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show current week" }));
    expect(
      screen.getByRole("link", { name: "2026-04-01: 0 scheduled" }),
    ).toHaveAttribute("aria-current", "date");
  });
});
