// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  classifyProductionStage,
  isStageUnreachable,
  PRODUCTION_STAGES,
  UNREACHABLE_STAGES,
} from "@/lib/production/stage";

const NO_SIGNALS = { hasScript: false, hasVariantReadyForReview: false };

const BASE = {
  status: "draft" as const,
  scripture_reference: null,
  scripture_verification_status: "unverified" as const,
};

describe("classifyProductionStage", () => {
  it("puts a bare draft in plan", () => {
    expect(classifyProductionStage(BASE, NO_SIGNALS)).toBe("plan");
  });

  it("moves an item with a script to write", () => {
    expect(
      classifyProductionStage(BASE, { ...NO_SIGNALS, hasScript: true }),
    ).toBe("write");
  });

  it("holds an item at verify_scripture while its Scripture is unverified", () => {
    expect(
      classifyProductionStage(
        {
          ...BASE,
          scripture_reference: "2 Peter 1:4",
          scripture_verification_status: "unverified",
        },
        { ...NO_SIGNALS, hasScript: true },
      ),
    ).toBe("verify_scripture");
  });

  it("returns a verified item to verify_scripture when verification lapses", () => {
    // The whole point of the reset rule: lapsed verification pulls the item
    // back, rather than letting unchecked wording drift downstream.
    expect(
      classifyProductionStage(
        {
          ...BASE,
          status: "ready_for_review",
          scripture_reference: "2 Peter 1:4",
          scripture_verification_status: "verification_required",
        },
        { hasScript: true, hasVariantReadyForReview: true },
      ),
    ).toBe("verify_scripture");
  });

  it("lets a verified item reach review", () => {
    expect(
      classifyProductionStage(
        {
          status: "ready_for_review",
          scripture_reference: "2 Peter 1:4",
          scripture_verification_status: "manually_verified",
        },
        { ...NO_SIGNALS, hasScript: true },
      ),
    ).toBe("review");
  });

  it("treats a variant marked ready as review", () => {
    expect(
      classifyProductionStage(BASE, {
        hasScript: true,
        hasVariantReadyForReview: true,
      }),
    ).toBe("review");
  });

  it("ignores verification for an item with no Scripture at all", () => {
    // Not every content type carries a verse; such an item should not be
    // stuck waiting for a verification that will never be needed.
    expect(
      classifyProductionStage(
        { ...BASE, scripture_verification_status: "unverified" },
        { ...NO_SIGNALS, hasScript: true },
      ),
    ).toBe("write");
  });

  it("takes an archived item out of production", () => {
    expect(
      classifyProductionStage(
        { ...BASE, status: "archived" },
        { hasScript: true, hasVariantReadyForReview: true },
      ),
    ).toBe("plan");
  });

  it("never classifies anything into a stage that does not exist", () => {
    // Produce, approve, schedule and publish have no machinery behind them.
    const cases = [
      { item: BASE, signals: NO_SIGNALS },
      {
        item: BASE,
        signals: { hasScript: true, hasVariantReadyForReview: true },
      },
      {
        item: {
          status: "ready_for_review" as const,
          scripture_reference: "2 Peter 1:4",
          scripture_verification_status: "manually_verified" as const,
        },
        signals: { hasScript: true, hasVariantReadyForReview: true },
      },
      { item: { ...BASE, status: "archived" as const }, signals: NO_SIGNALS },
    ];

    for (const { item, signals } of cases) {
      expect(UNREACHABLE_STAGES).not.toContain(
        classifyProductionStage(item, signals),
      );
    }
  });
});

describe("the stage vocabulary", () => {
  it("matches the approved workflow", () => {
    expect([...PRODUCTION_STAGES]).toEqual([
      "plan",
      "verify_scripture",
      "write",
      "produce",
      "review",
      "approve",
      "schedule",
      "publish",
    ]);
  });

  it("leaves publish as the only unreachable stage", () => {
    // Stage 4 made produce real, Stage 5 made approve and schedule real.
    // Nothing publishes, so publish stays unreachable.
    expect(isStageUnreachable("publish")).toBe(true);
  });

  it("marks every built stage as reachable", () => {
    for (const stage of [
      "plan",
      "verify_scripture",
      "write",
      "produce",
      "review",
      "approve",
      "schedule",
    ] as const) {
      expect(isStageUnreachable(stage), stage).toBe(false);
    }
  });
});
