import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublishQueueEntry } from "@/components/publish/queue-entry";
import type { ContentItem } from "@/lib/content/types";
import {
  groupQueue,
  QUEUE_SECTIONS,
  queueCounts,
  type QueueEntry,
} from "@/lib/publishing/repository";
import type { PublishAttempt } from "@/lib/publishing/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The Publish Queue.
 *
 * Two guarantees on this screen: it shows only real rows, and it never offers
 * a link to a post that does not exist. An external link appears only when the
 * platform's own id is present — which, in Stage 6, never happens.
 */

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
    attempt_count: 0,
    claimed_at: null,
    claim_token: null,
    claim_expires_at: null,
    claimed_by: null,
    queued_at: null,
    publishing_started_at: null,
    posted_at: null,
    external_post_id: null,
    external_post_url: null,
    last_error_code: null,
    last_error_message: null,
    outcome_detail: null,
    external_processing_status: null,
    external_processing_checked_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function attempt(overrides: Partial<PublishAttempt> = {}): PublishAttempt {
  return {
    id: "attempt-1",
    owner_id: "owner-1",
    scheduled_post_id: "post-1",
    platform_variant_id: "variant-1",
    platform: "youtube",
    attempt_number: 1,
    idempotency_key: "pp_publish_youtube_abc",
    status: "blocked",
    provider: "none",
    retryable: false,
    safe_error_code: "provider_not_connected",
    safe_error_message: "No connection to this platform",
    external_post_id: null,
    external_post_url: null,
    started_at: "2026-08-11T18:30:00Z",
    completed_at: "2026-08-11T18:30:00Z",
    created_at: "2026-08-11T18:30:00Z",
    ...overrides,
  };
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    post: post(),
    variant: {
      id: "variant-1",
      content_item_id: "item-1",
      platform: "youtube",
      review_state: "approved",
    } as PlatformVariant,
    item: { id: "item-1", title: "A promise" } as ContentItem,
    attempts: [],
    ...overrides,
  };
}

describe("queue grouping", () => {
  it("shows the sections the lifecycle can produce", () => {
    expect([...QUEUE_SECTIONS]).toEqual([
      "scheduled",
      "queued",
      "publishing",
      "failed",
      "posted",
    ]);
  });

  it("groups entries by their real status", () => {
    const grouped = groupQueue([
      entry(),
      entry({ post: post({ id: "post-2", status: "queued" }) }),
      entry({
        post: post({
          id: "post-3",
          status: "failed",
          last_error_code: "unknown",
        }),
      }),
    ]);

    expect(grouped.get("scheduled")).toHaveLength(1);
    expect(grouped.get("queued")).toHaveLength(1);
    expect(grouped.get("failed")).toHaveLength(1);
    // Nothing invents a posted row.
    expect(grouped.get("posted")).toBeUndefined();
  });

  it("counts only what exists", () => {
    expect(queueCounts([entry()])).toEqual({ scheduled: 1 });
    expect(queueCounts([])).toEqual({});
  });
});

describe("PublishQueueEntry", () => {
  it("shows the platform, time and status", () => {
    render(<PublishQueueEntry entry={entry()} />);

    expect(screen.getByText("A promise")).toBeInTheDocument();
    expect(screen.getByText(/YouTube/)).toBeInTheDocument();
    // 18:30 UTC is 19:30 in London during summer.
    expect(screen.getByText(/19:30/)).toBeInTheDocument();
    expect(screen.getByText("Schedule: Scheduled")).toBeInTheDocument();
  });

  it("says not connected rather than merely scheduled", () => {
    // The badge answers "what is this row doing", which a scheduled row with
    // no connected account cannot answer with "Scheduled".
    render(<PublishQueueEntry entry={entry()} platformConnected={false} />);

    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("says ready once the platform is connected", () => {
    render(<PublishQueueEntry entry={entry()} platformConnected />);

    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("offers no external link when there is no external post", () => {
    // The whole guarantee of Stage 6 in one assertion: no post exists, so
    // there is nothing to link to.
    render(<PublishQueueEntry entry={entry()} />);

    expect(screen.queryByRole("link", { name: /View on/ })).toBeNull();
  });

  it("links out only when the platform's own id and url are present", () => {
    render(
      <PublishQueueEntry
        entry={entry({
          post: post({
            status: "posted",
            external_post_id: "yt_abc123",
            external_post_url: "https://example.test/watch",
            posted_at: "2026-08-11T18:31:00Z",
          }),
        })}
      />,
    );

    expect(
      screen.getByRole("link", { name: /View on YouTube/ }),
    ).toHaveAttribute("href", "https://example.test/watch");
  });

  it("explains a recorded failure in words", () => {
    render(
      <PublishQueueEntry
        entry={entry({
          post: post({
            status: "failed",
            last_error_code: "provider_not_connected",
            last_error_message: "No connection to this platform",
          }),
        })}
      />,
    );

    expect(
      screen.getByText(/No connection to this platform/),
    ).toBeInTheDocument();
  });

  it("lists the attempt history with its retryability", () => {
    render(<PublishQueueEntry entry={entry({ attempts: [attempt()] })} />);

    expect(screen.getByText(/Attempt history \(1\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Attempt 1 · Blocked · provider none/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Not retryable/)).toBeInTheDocument();
  });

  it("says plainly that a blocked attempt sent nothing", () => {
    render(<PublishQueueEntry entry={entry({ attempts: [attempt()] })} />);

    expect(screen.getByText("Blocked")).toBeInTheDocument();
    // Said once, on the detail line — not repeated further down the row.
    expect(screen.getAllByText(/Nothing reached a platform/i)).toHaveLength(1);
  });

  it("shows no attempt history when there is none", () => {
    render(<PublishQueueEntry entry={entry()} />);

    expect(screen.queryByText(/Attempt history/)).toBeNull();
  });
});
