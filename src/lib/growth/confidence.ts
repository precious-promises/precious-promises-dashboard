/**
 * How much a pattern is worth believing.
 *
 * The Growth Centre is an evidence surface, not a fortune teller. Every finding
 * it shows carries a confidence label, and the rules that produce that label
 * are written here so they can be argued with rather than trusted.
 *
 * ## What confidence is not
 *
 * It is **not** a statistical significance test. These are observational
 * samples of a handful of posts with no control, no randomisation and no
 * isolation of variables — a p-value computed over that would be a decoration
 * that made the number look more solid than it is.
 *
 * So confidence here is a plain-language description of how much evidence
 * exists, based on four things anyone can check:
 *
 * 1. **How many comparable posts** the finding rests on.
 * 2. **How complete the metrics are** across them.
 * 3. **How long they have been observed** — a post measured after six hours
 *    has not finished happening.
 * 4. **How consistent** the result is within the group.
 *
 * ## What findings may say
 *
 * Never "this topic causes more views". Always "posts in this group have
 * performed better in the observed data". The distinction is the difference
 * between a description and a claim, and only one of them is supportable.
 */

export const CONFIDENCE_LEVELS = [
  "insufficient_data",
  "early_signal",
  "moderate_evidence",
  "strong_pattern",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  insufficient_data: "Not enough data",
  early_signal: "Early signal",
  moderate_evidence: "Moderate evidence",
  strong_pattern: "Consistent pattern",
};

export const CONFIDENCE_DETAIL: Record<ConfidenceLevel, string> = {
  insufficient_data:
    "There are too few comparable posts to say anything. This is not a weak result — it is the absence of one.",
  early_signal:
    "A difference is visible, but across few enough posts that it could easily be chance. Worth watching, not worth acting on alone.",
  moderate_evidence:
    "Enough comparable posts to be worth a deliberate test. Still an observation about what happened, not a claim about why.",
  strong_pattern:
    "The same direction across enough posts, consistently, that it is unlikely to be noise. Still a description of the observed data, never a cause.",
};

/**
 * The minimum number of comparable posts before anything is said at all.
 *
 * Three is deliberately low for "early signal" and deliberately labelled as
 * such: below this, the Growth Centre says "not enough data" rather than
 * ranking two posts against each other and calling it a finding.
 */
export const MINIMUM_COMPARABLE_POSTS = 3;
export const MODERATE_COMPARABLE_POSTS = 6;
export const STRONG_COMPARABLE_POSTS = 12;

/**
 * How long a post must have been observed before it counts.
 *
 * A post measured two hours after publication is still being watched. Counting
 * it alongside a month-old post would compare a beginning against an ending.
 */
export const MINIMUM_OBSERVATION_HOURS = 24;

export interface ConfidenceInput {
  /** Posts in the group being described. */
  comparablePosts: number;
  /** Of those, how many carry the metric being compared. */
  postsWithMetric: number;
  /** Hours since the *youngest* post in the group was published. */
  youngestObservationHours: number;
  /**
   * How consistent the result is, 0–1.
   *
   * Typically the share of posts in the group that moved in the same direction
   * as the group's overall result. A group where every post beats the baseline
   * is 1; a group where half do is 0.5, which is no pattern at all.
   */
  consistency: number;
}

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  /** Why it landed there, in words the interface shows verbatim. */
  reasons: string[];
  /** Everything the assessment was based on, for display. */
  basis: ConfidenceInput;
}

/**
 * Assess a finding.
 *
 * Fails downward at every step: any one weakness caps the level, rather than
 * being averaged away by strengths elsewhere. A perfectly consistent result
 * over two posts is still two posts.
 */
export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const reasons: string[] = [];

  if (input.comparablePosts < MINIMUM_COMPARABLE_POSTS) {
    return {
      level: "insufficient_data",
      reasons: [
        `Only ${input.comparablePosts} comparable ${input.comparablePosts === 1 ? "post" : "posts"}; at least ${MINIMUM_COMPARABLE_POSTS} are needed before a comparison means anything.`,
      ],
      basis: input,
    };
  }

  if (input.postsWithMetric < MINIMUM_COMPARABLE_POSTS) {
    return {
      level: "insufficient_data",
      reasons: [
        `Only ${input.postsWithMetric} of ${input.comparablePosts} comparable posts have this metric recorded.`,
      ],
      basis: input,
    };
  }

  if (input.youngestObservationHours < MINIMUM_OBSERVATION_HOURS) {
    return {
      level: "insufficient_data",
      reasons: [
        `The newest post in this group is under ${MINIMUM_OBSERVATION_HOURS} hours old, so it has not finished performing yet.`,
      ],
      basis: input,
    };
  }

  // Coverage: a group where a third of posts lack the metric is a group whose
  // comparison is mostly about which posts happened to be measured.
  const coverage = input.postsWithMetric / input.comparablePosts;
  if (coverage < 0.6) {
    reasons.push(
      `Only ${Math.round(coverage * 100)}% of comparable posts have this metric, so the comparison covers part of the picture.`,
    );
    return { level: "early_signal", reasons, basis: input };
  }

  if (input.consistency < 0.6) {
    reasons.push(
      `The posts in this group do not move together — ${Math.round(input.consistency * 100)}% share the group's direction.`,
    );
    return { level: "early_signal", reasons, basis: input };
  }

  if (input.postsWithMetric < MODERATE_COMPARABLE_POSTS) {
    reasons.push(
      `${input.postsWithMetric} posts carry this metric, which is enough to notice and not enough to rely on.`,
    );
    return { level: "early_signal", reasons, basis: input };
  }

  if (
    input.postsWithMetric >= STRONG_COMPARABLE_POSTS &&
    input.consistency >= 0.75
  ) {
    reasons.push(
      `${input.postsWithMetric} comparable posts, ${Math.round(input.consistency * 100)}% moving in the same direction.`,
    );
    return { level: "strong_pattern", reasons, basis: input };
  }

  reasons.push(
    `${input.postsWithMetric} comparable posts, ${Math.round(input.consistency * 100)}% moving in the same direction.`,
  );
  return { level: "moderate_evidence", reasons, basis: input };
}

/** Whether a finding is worth showing as a finding rather than as an absence. */
export function isActionable(level: ConfidenceLevel): boolean {
  return level === "moderate_evidence" || level === "strong_pattern";
}

/**
 * Phrase a finding without claiming causation.
 *
 * Every headline in the Growth Centre goes through here. It is a small
 * function guarding a large distinction: describing what happened is
 * supportable, and explaining why it happened is not.
 */
export function describeFinding(input: {
  groupLabel: string;
  metricLabel: string;
  direction: "higher" | "lower";
  differencePercent: number;
  level: ConfidenceLevel;
}): string {
  if (input.level === "insufficient_data") {
    return `Not enough comparable posts to say anything about ${input.groupLabel}.`;
  }

  const magnitude = Math.abs(Math.round(input.differencePercent));

  return `Posts in ${input.groupLabel} have recorded ${magnitude}% ${input.direction} ${input.metricLabel} than the rest in the observed data.`;
}

/**
 * How consistent a set of values is with the group's overall direction.
 *
 * Returns the share of values on the same side of the baseline as the group
 * mean. An empty set is 0 — no consistency, rather than perfect consistency
 * over nothing.
 */
export function consistencyOf(
  values: readonly number[],
  baseline: number,
): number {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const groupIsAbove = mean >= baseline;

  const agreeing = values.filter((value) =>
    groupIsAbove ? value >= baseline : value < baseline,
  ).length;

  return agreeing / values.length;
}
