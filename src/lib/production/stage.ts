import type { ContentItem } from "@/lib/content/types";

/**
 * Production stage classification.
 *
 * Reusable domain logic for the Production Board, which is **not activated**.
 * Stage 3 uses it internally — on the content detail page and for a dashboard
 * count — so it is exercised rather than speculative, but no board renders it
 * yet.
 *
 * The stages beyond Review are computed as *not yet reached*, never as reached.
 * Approval, scheduling and publishing do not exist, so nothing can legitimately
 * be classified into them, and this function will not pretend otherwise.
 */

export const PRODUCTION_STAGES = [
  "plan",
  "verify_scripture",
  "write",
  "produce",
  "review",
  "approve",
  "schedule",
  "publish",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const PRODUCTION_STAGE_LABELS: Record<ProductionStage, string> = {
  plan: "Plan",
  verify_scripture: "Verify Scripture",
  write: "Write",
  produce: "Produce",
  review: "Review",
  approve: "Approve",
  schedule: "Schedule",
  publish: "Publish",
};

/**
 * Stages the product cannot yet place anything in.
 *
 * Kept explicit so the Production Board, when built, renders them as
 * structurally empty rather than appearing to have found nothing.
 */
export const UNREACHABLE_STAGES: readonly ProductionStage[] = [
  "produce",
  "approve",
  "schedule",
  "publish",
];

export interface ProductionSignals {
  /** Has a script revision been saved? */
  hasScript: boolean;
  /** Is any platform variant marked ready for review? */
  hasVariantReadyForReview: boolean;
}

/**
 * Where a content item currently sits.
 *
 * Read top-down; the first matching condition wins.
 *
 * - **Archived** items are out of production entirely — reported as `plan`
 *   rather than given a stage they are not really in.
 * - **Scripture needing attention outranks everything else.** An item whose
 *   verification lapsed is not "in writing" — it is waiting on a decision
 *   about its Scripture, and treating it otherwise would let unverified
 *   wording drift downstream.
 * - **`ready_for_review`** on the item, or a variant marked ready, means it is
 *   in review.
 * - An item with a script is in `write`; without one it is still `plan`.
 */
export function classifyProductionStage(
  item: Pick<
    ContentItem,
    "status" | "scripture_reference" | "scripture_verification_status"
  >,
  signals: ProductionSignals,
): ProductionStage {
  if (item.status === "archived") {
    return "plan";
  }

  const hasScripture = (item.scripture_reference ?? "").trim() !== "";
  const scriptureNeedsAttention =
    hasScripture && item.scripture_verification_status !== "manually_verified";

  if (scriptureNeedsAttention) {
    return "verify_scripture";
  }

  if (item.status === "ready_for_review" || signals.hasVariantReadyForReview) {
    return "review";
  }

  return signals.hasScript ? "write" : "plan";
}

/** True when nothing can currently reach this stage. */
export function isStageUnreachable(stage: ProductionStage): boolean {
  return UNREACHABLE_STAGES.includes(stage);
}
