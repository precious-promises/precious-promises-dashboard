// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  deriveQueueState,
  QUEUE_STATE_DETAIL,
  QUEUE_STATE_LABELS,
  QUEUE_STATES,
  type QueueStateInput,
} from "@/lib/publishing/queue-state";
import type { ScheduledPost } from "@/lib/schedule/types";

/**
 * What the Publish Queue says a row is doing.
 *
 * The distinction being defended: **uploaded is not published.** YouTube
 * accepts the bytes, returns an id, then processes the video — and processing
 * can fail. A queue that showed both as "Posted" would assert something nobody
 * verified.
 */

const NOW = "2026-08-11T18:30:00Z";

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: "post-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    scheduled_for: NOW,
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
    external_processing_status: null,
    external_processing_checked_at: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function input(overrides: Partial<QueueStateInput> = {}): QueueStateInput {
  return {
    post: post(),
    latestAttemptStatus: null,
    platformConnected: true,
    ...overrides,
  };
}

describe("uploaded is not published", () => {
  it("says processing while YouTube is still working on it", () => {
    for (const status of ["uploaded", "processing"] as const) {
      expect(
        deriveQueueState(
          input({
            post: post({
              status: "posted",
              external_post_id: "vid_abc",
              posted_at: NOW,
              external_processing_status: status,
            }),
          }),
        ),
        status,
      ).toBe("uploaded_processing");
    }
  });

  it("says posted once YouTube reports it processed", () => {
    expect(
      deriveQueueState(
        input({
          post: post({
            status: "posted",
            external_post_id: "vid_abc",
            posted_at: NOW,
            external_processing_status: "processed",
          }),
        }),
      ),
    ).toBe("posted");
  });

  it("says posted when the platform reports no processing state at all", () => {
    // Not every platform has one. Absence is not evidence of a problem.
    expect(
      deriveQueueState(
        input({
          post: post({
            status: "posted",
            external_post_id: "vid_abc",
            posted_at: NOW,
          }),
        }),
      ),
    ).toBe("posted");
  });

  it("still reports a processing failure as posted, because the video exists", () => {
    // The upload genuinely happened. Saying otherwise would be as false as
    // claiming a success that did not — the failure belongs on the detail line.
    expect(
      deriveQueueState(
        input({
          post: post({
            status: "posted",
            external_post_id: "vid_abc",
            posted_at: NOW,
            external_processing_status: "processing_failed",
          }),
        }),
      ),
    ).toBe("posted");
  });
});

describe("a row that cannot go anywhere says so", () => {
  it("reports not connected rather than merely scheduled", () => {
    expect(deriveQueueState(input({ platformConnected: false }))).toBe(
      "not_connected",
    );
  });

  it("reports ready when a connection exists", () => {
    expect(deriveQueueState(input())).toBe("ready");
  });

  it("surfaces a refusal recorded on the attempt", () => {
    // A block returns the schedule to `scheduled`, so the attempt is the only
    // place the refusal is visible.
    expect(deriveQueueState(input({ latestAttemptStatus: "blocked" }))).toBe(
      "blocked",
    );
  });
});

describe("outcomes win over connection state", () => {
  it("reports a posted row as posted even with nothing connected now", () => {
    // A post that already went out is not waiting on anything.
    expect(
      deriveQueueState(
        input({
          post: post({
            status: "posted",
            external_post_id: "vid_abc",
            posted_at: NOW,
          }),
          platformConnected: false,
        }),
      ),
    ).toBe("posted");
  });

  it("reports a failure as failed", () => {
    expect(
      deriveQueueState(
        input({
          post: post({ status: "failed", last_error_code: "unknown" }),
          platformConnected: false,
        }),
      ),
    ).toBe("failed");
  });

  it("reports a stood-down schedule as the owner's decision", () => {
    for (const status of ["paused", "cancelled"] as const) {
      expect(
        deriveQueueState(
          input({
            post: post({
              status,
              paused_at: status === "paused" ? NOW : null,
              pause_reason: status === "paused" ? "Approval withdrawn" : null,
              cancelled_at: status === "cancelled" ? NOW : null,
              cancellation_reason: status === "cancelled" ? "No" : null,
            }),
            platformConnected: false,
          }),
        ),
        status,
      ).toBe("stood_down");
    }
  });

  it("reports an in-flight provider call as uploading", () => {
    expect(
      deriveQueueState(
        input({ post: post({ status: "publishing", attempt_count: 1 }) }),
      ),
    ).toBe("uploading");
  });
});

describe("every state is explained", () => {
  it("gives each one a label and a sentence", () => {
    for (const state of QUEUE_STATES) {
      expect(QUEUE_STATE_LABELS[state], state).toBeTruthy();
      expect(QUEUE_STATE_DETAIL[state].length, state).toBeGreaterThan(20);
    }
  });

  it("has no duplicate states", () => {
    expect(new Set(QUEUE_STATES).size).toBe(QUEUE_STATES.length);
  });
});
