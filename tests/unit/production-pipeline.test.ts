// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canTransitionProduction,
  PIPELINE_HANDOFF_STATEMENT,
  PRODUCTION_JOB_STATUS_LABELS,
  PRODUCTION_JOB_STATUSES,
  TERMINAL_PRODUCTION_STATUSES,
} from "@/lib/production/pipeline";

/**
 * The production pipeline state machine.
 *
 * The property everything else hangs on: the pipeline's last word is
 * `ready_for_review`. No status names publication, no transition reaches
 * one, and the module cannot even see the publishing code.
 */

describe("production job vocabulary", () => {
  it("is exactly the approved statuses", () => {
    expect([...PRODUCTION_JOB_STATUSES]).toEqual([
      "pending",
      "planning",
      "generating_text",
      "generating_voice",
      "rendering",
      "ready_for_review",
      "failed",
      "cancelled",
    ]);
  });

  it("labels every status", () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      expect(PRODUCTION_JOB_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("names nothing beyond review", () => {
    for (const status of PRODUCTION_JOB_STATUSES) {
      expect(status).not.toMatch(/approv|schedul|publish|posted/);
    }
  });
});

describe("transitions", () => {
  it("only move forward through the generation steps", () => {
    const order = [
      "pending",
      "planning",
      "generating_text",
      "generating_voice",
      "rendering",
      "ready_for_review",
    ] as const;

    for (let from = 0; from < order.length; from++) {
      for (let to = 0; to < order.length; to++) {
        if (to <= from) {
          expect(
            canTransitionProduction(order[from]!, order[to]!),
            `${order[from]} → ${order[to]} must not go backwards`,
          ).toBe(false);
        }
      }
    }
  });

  it("allows optional steps to be skipped forward", () => {
    expect(canTransitionProduction("planning", "rendering")).toBe(true);
    expect(canTransitionProduction("planning", "ready_for_review")).toBe(true);
    expect(canTransitionProduction("generating_text", "rendering")).toBe(true);
  });

  it("makes ready_for_review terminal — the pipeline's work ends there", () => {
    for (const to of PRODUCTION_JOB_STATUSES) {
      expect(canTransitionProduction("ready_for_review", to)).toBe(false);
    }
    expect(TERMINAL_PRODUCTION_STATUSES).toContain("ready_for_review");
  });

  it("blocks later steps after a failure until an explicit retry", () => {
    expect(canTransitionProduction("failed", "rendering")).toBe(false);
    expect(canTransitionProduction("failed", "ready_for_review")).toBe(false);
    expect(canTransitionProduction("failed", "pending")).toBe(true);
    expect(canTransitionProduction("failed", "cancelled")).toBe(true);
  });

  it("makes cancellation final and reachable from every active status", () => {
    for (const from of [
      "pending",
      "planning",
      "generating_text",
      "generating_voice",
      "rendering",
    ] as const) {
      expect(canTransitionProduction(from, "cancelled"), from).toBe(true);
    }
    for (const to of PRODUCTION_JOB_STATUSES) {
      expect(canTransitionProduction("cancelled", to)).toBe(false);
    }
  });

  it("cannot fail from pending or planning — there is no work to fail yet", () => {
    expect(canTransitionProduction("pending", "failed")).toBe(false);
    expect(canTransitionProduction("planning", "failed")).toBe(false);
  });
});

describe("the handoff to the human path", () => {
  it("states it as data the interface and tests share", () => {
    expect(PIPELINE_HANDOFF_STATEMENT).toMatch(/ready for review/i);
    expect(PIPELINE_HANDOFF_STATEMENT).toMatch(
      /nothing moves from generation to publication/i,
    );
  });

  it("keeps the pipeline module blind to publishing", () => {
    const pipeline = readFileSync(
      join(process.cwd(), "src/lib/production/pipeline.ts"),
      "utf8",
    );
    expect(pipeline).not.toMatch(/from ["']@\/lib\/publishing/);
    expect(pipeline).not.toContain("scheduled_posts");
    expect(pipeline).not.toContain("publish_attempts");
  });

  it("keeps the pipeline actions away from approval and publish writes", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/dashboard/production/pipeline-actions.ts"),
      "utf8",
    );
    expect(actions).not.toContain("content_approvals");
    expect(actions).not.toContain("scheduled_posts");
    expect(actions).not.toContain("publish_attempts");
    expect(actions).not.toMatch(/review_state:\s*["']approved["']/);
  });

  it("requires a genuinely completed render before ready_for_review", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/dashboard/production/pipeline-actions.ts"),
      "utf8",
    );
    expect(actions).toMatch(/renderStatus !== ["']completed["']/);
  });

  it("is enforced in the database as well", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260815090000_create_production_automation.sql",
      ),
      "utf8",
    );
    expect(migration).toMatch(
      /production_jobs[\s\S]*?status in \(\s*'pending',\s*'planning',\s*'generating_text',\s*'generating_voice',\s*'rendering',\s*'ready_for_review',\s*'failed',\s*'cancelled'\s*\)/,
    );
  });
});
