import type { ContentItem } from "@/lib/content/types";

/**
 * Production stage classification.
 *
 * Reusable domain logic for the Production Board. Every stage is computed
 * from records — Scripture verification, saved scripts, video projects,
 * approvals, schedules — never stored as a board position, and never set by
 * dragging a card.
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
 * Stages this classifier does not place anything in.
 *
 * `publish` is deliberately not a board column even though publishing now
 * exists (Stage 6–9). A published post is a per-platform outcome with its own
 * full record — the Publish Queue shows every claim, attempt and result — and
 * collapsing that into a card position would flatten exactly the distinctions
 * (posted vs drafted vs prepared-for-manual-posting) that queue exists to
 * keep. The board tracks preparation up to scheduling; publishing reports
 * itself.
 */
export const UNREACHABLE_STAGES: readonly ProductionStage[] = ["publish"];

/**
 * The columns the Production Board shows.
 *
 * `publish` is deliberately absent rather than present-and-empty: a column
 * implies a place work can arrive at, and nothing can arrive there.
 */
export const BOARD_STAGES: readonly ProductionStage[] = [
  "plan",
  "verify_scripture",
  "write",
  "produce",
  "review",
  "approve",
  "schedule",
];

export interface ProductionSignals {
  /** Has a script revision been saved? */
  hasScript: boolean;
  /** Is any platform variant marked ready for review? */
  hasVariantReadyForReview: boolean;
  /** Does a video project with at least one scene exist? */
  hasVideo?: boolean;
  /** Is any platform variant approved, with its approval still valid? */
  hasValidApproval?: boolean;
  /** Is any approved variant currently scheduled? */
  hasActiveSchedule?: boolean;
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
 * - After that the checks run from the most advanced stage backwards, so an
 *   item reports the furthest point it has genuinely reached.
 *
 * Every signal is **derived from records**, never set by dragging a card. A
 * card cannot be moved into Approve because somebody dropped it there; it
 * appears there because an approval exists and still matches its content.
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

  if (signals.hasActiveSchedule) {
    return "schedule";
  }

  // Only a *valid* approval counts. An approval whose fingerprint no longer
  // matches the content has already been invalidated, and showing the item as
  // approved would be the interface disagreeing with the database.
  if (signals.hasValidApproval) {
    return "approve";
  }

  if (item.status === "ready_for_review" || signals.hasVariantReadyForReview) {
    return "review";
  }

  if (signals.hasVideo) {
    return "produce";
  }

  return signals.hasScript ? "write" : "plan";
}

/** True when nothing can currently reach this stage. */
export function isStageUnreachable(stage: ProductionStage): boolean {
  return UNREACHABLE_STAGES.includes(stage);
}
