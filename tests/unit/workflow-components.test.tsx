import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VariantRow } from "@/components/approvals/variant-row";
import { MonthGrid } from "@/components/calendar/month-grid";
import type { ReviewRow } from "@/lib/approvals/repository";
import { buildMonthGrid } from "@/lib/schedule/calendar";
import type { ScheduleEntry } from "@/lib/schedule/repository";
import type { ScheduledPost } from "@/lib/schedule/types";

/**
 * The surfaces where an out-of-date approval has to be visible.
 *
 * An approval whose content moved is the single most important thing on the
 * Approval Queue, so the row says so — burying it one click away would defeat
 * the point of tracking it.
 */

function reviewRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    variant: {
      id: "variant-1",
      owner_id: "owner-1",
      content_item_id: "item-1",
      platform: "youtube",
      variant_type: "youtube_short",
      title: "Precious promises",
      caption: "A word for today.",
      description: null,
      hashtags: [],
      first_comment: null,
      cta: null,
      thumbnail_text: null,
      review_state: "ready_for_review",
      approved_at: null,
      approved_by: null,
      approval_hash: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    },
    item: {
      id: "item-1",
      owner_id: "owner-1",
      title: "A promise for today",
      content_type: "youtube_short",
      topic: null,
      scripture_reference: "2 Peter 1:4",
      scripture_text: "…",
      scripture_translation: "KJV",
      scripture_verification_status: "manually_verified",
      scripture_verified_at: "2026-08-08T00:00:00Z",
      scripture_verified_by: "owner-1",
      description: null,
      status: "draft",
      created_at: "2026-08-08T00:00:00Z",
      updated_at: "2026-08-08T00:00:00Z",
    },
    subject: {} as ReviewRow["subject"],
    currentFingerprint: "a".repeat(64),
    validity: "not_approved",
    blockers: [],
    hasVideo: true,
    videoProjectId: "video-1",
    latestScriptRevision: 2,
    mediaCount: 0,
    schedules: [],
    ...overrides,
  };
}

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: "post-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    scheduled_for: "2026-08-11T18:30:00Z",
    timezone: "Europe/London",
    status: "scheduled",
    approval_hash: "a".repeat(64),
    recurring_rule_id: null,
    paused_at: null,
    pause_reason: null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("VariantRow", () => {
  it("shows the platform, Scripture status and script revision", () => {
    render(<VariantRow row={reviewRow()} selected={false} />);

    expect(screen.getByText("A promise for today")).toBeInTheDocument();
    expect(screen.getByText(/YouTube · Short/)).toBeInTheDocument();
    expect(screen.getByText(/2 Peter 1:4 · Verified/)).toBeInTheDocument();
    expect(screen.getByText(/Revision 2/)).toBeInTheDocument();
  });

  it("calls out an approval that no longer matches its content", () => {
    render(
      <VariantRow
        row={reviewRow({
          validity: "invalidated",
          variant: { ...reviewRow().variant, review_state: "ready_for_review" },
        })}
        selected={false}
      />,
    );

    expect(
      screen.getByText(/content changed after approval/i),
    ).toBeInTheDocument();
  });

  it("says nothing about a stale approval when there is none", () => {
    render(<VariantRow row={reviewRow()} selected={false} />);

    expect(screen.queryByText(/content changed after approval/i)).toBeNull();
  });

  it("shows the scheduled time in the schedule's own zone", () => {
    render(
      <VariantRow row={reviewRow({ schedules: [post()] })} selected={false} />,
    );

    // 18:30 UTC is 19:30 in London during summer.
    expect(screen.getByText(/19:30/)).toBeInTheDocument();
  });

  it("explains a paused schedule rather than hiding it", () => {
    render(
      <VariantRow
        row={reviewRow({
          schedules: [
            post({
              status: "paused",
              paused_at: "2026-08-09T00:00:00Z",
              pause_reason: "Approval invalidated by content change.",
            }),
          ],
        })}
        selected={false}
      />,
    );

    expect(
      screen.getByText(/Approval invalidated by content change/),
    ).toBeInTheDocument();
  });

  it("links to its own review view", () => {
    render(<VariantRow row={reviewRow()} selected={false} />);

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/approvals?variant=variant-1",
    );
  });
});

describe("MonthGrid", () => {
  const entry: ScheduleEntry = {
    post: post(),
    variant: {
      id: "variant-1",
      platform: "youtube",
    } as ScheduleEntry["variant"],
    item: { id: "item-1", title: "A promise" } as ScheduleEntry["item"],
  };

  it("renders a Monday-first month", () => {
    render(
      <MonthGrid
        grid={buildMonthGrid(2026, 8, "Europe/London", [])}
        timeZone="Europe/London"
      />,
    );

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
  });

  it("places an entry on its local day with its local time", () => {
    render(
      <MonthGrid
        grid={buildMonthGrid(2026, 8, "Europe/London", [entry])}
        timeZone="Europe/London"
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard/calendar?entry=post-1");
    expect(link.textContent).toContain("19:30");
    expect(link.textContent).toContain("A promise");
  });

  it("shows an empty month as empty", () => {
    // No sample events anywhere in this product.
    render(
      <MonthGrid
        grid={buildMonthGrid(2026, 8, "Europe/London", [])}
        timeZone="Europe/London"
      />,
    );

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
