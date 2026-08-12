import type { VariantPlatform } from "@/lib/variants/types";

import { isWinner, type AnalysedPost, type WinningPost } from "./analysis";
import type { ConfidenceLevel } from "./confidence";

/**
 * Content worth using again.
 *
 * A repurpose candidate is a **planning suggestion and nothing more**. Nothing
 * here creates a variant, schedules a post, or touches an approval — it
 * produces a row in a list that says "this did well on one platform and does
 * not exist on another", and every downstream step remains a human decision
 * with the Stage 5 approval gate intact.
 *
 * That restraint is the whole design. A growth tool that could act on its own
 * findings would eventually publish something nobody approved, which is the
 * one thing this product must never do.
 */

export const REPURPOSE_KINDS = [
  "missing_on_platform",
  "long_form_without_short",
  "topic_underrepresented",
] as const;

export type RepurposeKind = (typeof REPURPOSE_KINDS)[number];

export const REPURPOSE_KIND_LABELS: Record<RepurposeKind, string> = {
  missing_on_platform: "Performed well, not on every platform",
  long_form_without_short: "Long-form with no short cut from it",
  topic_underrepresented: "Topic performing, thin in the schedule ahead",
};

export interface RepurposeCandidate {
  kind: RepurposeKind;
  contentItemId: string | null;
  scheduledPostId: string | null;
  title: string;
  /** Why this is being suggested, in words, with the evidence in it. */
  reason: string;
  /** Where it did well. */
  sourcePlatform: VariantPlatform | null;
  /** Where it is missing. */
  suggestedPlatform: VariantPlatform | null;
  confidence: ConfidenceLevel;
}

/**
 * Content that did well on one platform and was never published on another.
 *
 * Uses the winners list rather than raw metrics, so the "did well" half of the
 * sentence carries the same percentile discipline as everywhere else — and a
 * platform with too few comparable posts produces no winners and therefore no
 * suggestions, rather than suggesting on the strength of a single post.
 */
export function findMissingPlatformCandidates(input: {
  winners: readonly WinningPost[];
  /** Every post, so "was it published there" can be answered. */
  allPosts: readonly AnalysedPost[];
  platforms?: readonly VariantPlatform[];
}): RepurposeCandidate[] {
  const platforms = input.platforms ?? ["youtube", "instagram", "tiktok"];
  const candidates: RepurposeCandidate[] = [];

  // Which platforms each content item has already reached.
  const publishedOn = new Map<string, Set<VariantPlatform>>();
  for (const post of input.allPosts) {
    if (post.contentItemId === null) {
      continue;
    }
    const set = publishedOn.get(post.contentItemId) ?? new Set();
    set.add(post.platform);
    publishedOn.set(post.contentItemId, set);
  }

  for (const winner of input.winners) {
    if (!isWinner(winner) || winner.post.contentItemId === null) {
      continue;
    }

    const reached = publishedOn.get(winner.post.contentItemId) ?? new Set();

    for (const platform of platforms) {
      if (reached.has(platform)) {
        continue;
      }

      candidates.push({
        kind: "missing_on_platform",
        contentItemId: winner.post.contentItemId,
        scheduledPostId: winner.post.scheduledPostId,
        title: winner.post.title ?? "Untitled",
        reason: `This is in the top ${Math.round(100 - winner.percentile)}% of ${winner.comparisonLabel} by ${winner.metric.replace(/_/g, " ")}, measured against ${winner.comparedAgainst} comparable posts. It has never been published to ${platform}.`,
        sourcePlatform: winner.post.platform,
        suggestedPlatform: platform,
        // A winner is only a winner where the comparison set was big enough,
        // so the suggestion inherits that evidence rather than asserting more.
        confidence:
          winner.comparedAgainst >= 12 ? "strong_pattern" : "moderate_evidence",
      });
    }
  }

  return candidates;
}

/**
 * Long-form content with no short cut from it.
 *
 * Deterministic: a long post whose content item has produced nothing short.
 * Says nothing about whether a short *would* do well — only that the raw
 * material exists and has not been used.
 */
export function findShortsCandidates(
  posts: readonly AnalysedPost[],
): RepurposeCandidate[] {
  const shortsByItem = new Map<string, number>();
  for (const post of posts) {
    if (
      post.contentItemId !== null &&
      post.durationSeconds !== null &&
      post.durationSeconds < 60
    ) {
      shortsByItem.set(
        post.contentItemId,
        (shortsByItem.get(post.contentItemId) ?? 0) + 1,
      );
    }
  }

  const candidates: RepurposeCandidate[] = [];
  const seen = new Set<string>();

  for (const post of posts) {
    if (
      post.contentItemId === null ||
      post.durationSeconds === null ||
      post.durationSeconds <= 600 ||
      seen.has(post.contentItemId) ||
      (shortsByItem.get(post.contentItemId) ?? 0) > 0
    ) {
      continue;
    }

    seen.add(post.contentItemId);
    candidates.push({
      kind: "long_form_without_short",
      contentItemId: post.contentItemId,
      scheduledPostId: post.scheduledPostId,
      title: post.title ?? "Untitled",
      reason: `This runs over ten minutes and no short has been cut from it. The material exists; whether a short would perform is untested.`,
      sourcePlatform: post.platform,
      suggestedPlatform: null,
      // A structural observation, not a performance one. It rests on records
      // rather than on measurement, so it claims nothing about outcomes.
      confidence: "early_signal",
    });
  }

  return candidates;
}

/**
 * Topics doing well that are thin in what is coming up.
 *
 * Needs both halves — performance *and* a gap ahead. A topic performing well
 * and already scheduled heavily needs no suggestion, and a gap in a topic with
 * no evidence behind it is just an empty slot.
 */
export function findTopicGapCandidates(input: {
  /** Topics with enough evidence to be worth acting on, best first. */
  strongTopics: { topic: string; confidence: ConfidenceLevel }[];
  /** Topic counts in the upcoming schedule. */
  upcomingByTopic: Map<string, number>;
  threshold?: number;
}): RepurposeCandidate[] {
  const threshold = input.threshold ?? 1;

  return input.strongTopics
    .filter(
      (entry) => (input.upcomingByTopic.get(entry.topic) ?? 0) <= threshold,
    )
    .map((entry) => ({
      kind: "topic_underrepresented" as const,
      contentItemId: null,
      scheduledPostId: null,
      title: entry.topic,
      reason: `${entry.topic} has performed above the comparable baseline in the observed data, and only ${input.upcomingByTopic.get(entry.topic) ?? 0} upcoming ${(input.upcomingByTopic.get(entry.topic) ?? 0) === 1 ? "post covers" : "posts cover"} it.`,
      sourcePlatform: null,
      suggestedPlatform: null,
      confidence: entry.confidence,
    }));
}
