import {
  analyseGrouping,
  byTopic,
  findWinners,
  isWinner,
  type AnalysedPost,
} from "@/lib/growth/analysis";
import { isActionable, type ConfidenceLevel } from "@/lib/growth/confidence";
import { findTopicGapCandidates } from "@/lib/growth/repurpose";

/**
 * Analytics-informed planning suggestions.
 *
 * Pure functions over Stage 10's evidence machinery, and **AI-free by
 * construction**: nothing in this module can phrase, embellish or invent —
 * it selects from what the Growth Centre already established, carries the
 * evidence with the suggestion, and produces nothing when the evidence is
 * not there. AI may later rephrase a suggestion Dave already has; it cannot
 * manufacture one.
 */

export interface PlannerRecommendation {
  kind: "topic_gap" | "repurpose_winner" | "content_type_gap";
  headline: string;
  /** Why, in words that cite the record. */
  reason: string;
  /** What the evidence is, stated so it can be checked. */
  evidence: string;
  confidence: ConfidenceLevel;
}

export interface RecommendationInputs {
  posts: readonly AnalysedPost[];
  measuredCount: number;
  /** Open planner items per topic — the "already planned" side of a gap. */
  plannedTopicCounts: Map<string, number>;
}

export function buildPlannerRecommendations(
  inputs: RecommendationInputs,
): PlannerRecommendation[] {
  // No measurements, no data-driven claims. The planner shows this absence
  // honestly rather than dressing a hunch as analysis.
  if (inputs.measuredCount === 0) {
    return [];
  }

  const recommendations: PlannerRecommendation[] = [];

  // Topics performing above their comparable baseline with little planned.
  const topicFindings = analyseGrouping({
    posts: inputs.posts,
    metric: "views_or_plays",
    groupBy: byTopic,
  });

  const strongTopics = topicFindings
    .filter(
      (finding) =>
        isActionable(finding.confidence.level) &&
        finding.differencePercent !== null &&
        finding.differencePercent > 0,
    )
    .map((finding) => ({
      topic: finding.groupLabel,
      confidence: finding.confidence.level,
      finding,
    }));

  const gaps = findTopicGapCandidates({
    strongTopics: strongTopics.map(({ topic, confidence }) => ({
      topic,
      confidence,
    })),
    upcomingByTopic: inputs.plannedTopicCounts,
  });

  for (const gap of gaps) {
    const source = strongTopics.find((entry) => entry.topic === gap.title);
    recommendations.push({
      kind: "topic_gap",
      headline: `Plan more ${gap.title}`,
      reason: gap.reason,
      evidence:
        source?.finding.headline ??
        "Performance above the comparable baseline in the observed data.",
      confidence: gap.confidence,
    });
  }

  // Winners whose content items could feed a new plan entry.
  const winners = findWinners({
    posts: inputs.posts,
    metric: "views_or_plays",
    limit: 5,
  }).filter(isWinner);

  for (const winner of winners.slice(0, 3)) {
    recommendations.push({
      kind: "repurpose_winner",
      headline: `Plan a follow-up to “${winner.post.title ?? "an untitled post"}”`,
      reason: `It sits in the top ${Math.max(1, Math.round(100 - winner.percentile))}% of ${winner.comparisonLabel}, measured against ${winner.comparedAgainst} comparable posts.`,
      evidence: `Ranked by views/plays within its own comparison set (${winner.comparedAgainst} posts).`,
      confidence:
        winner.comparedAgainst >= 12 ? "strong_pattern" : "moderate_evidence",
    });
  }

  return recommendations;
}

/** What to say when there are no recommendations. Never generic advice. */
export function recommendationAbsenceReason(inputs: {
  publishedCount: number;
  measuredCount: number;
}): string {
  if (inputs.publishedCount === 0) {
    return "Nothing has been published yet, so there is no evidence to plan from. The planner still works — it just will not pretend to know what performs.";
  }
  if (inputs.measuredCount === 0) {
    return "Posts exist but no analytics have been fetched, so there is no evidence to plan from yet.";
  }
  return "There is measured data, but no pattern strong enough to turn into a recommendation. That is the evidence speaking, not a gap in it.";
}
