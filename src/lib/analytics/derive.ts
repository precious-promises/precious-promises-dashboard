import type { VariantPlatform } from "@/lib/variants/types";

import { reportsMetric } from "./providers";
import {
  reading,
  unavailable,
  type MetricName,
  type MetricReading,
  type MetricSource,
  type ObservationWindow,
} from "./types";

/**
 * Derived metrics.
 *
 * Nothing here is fetched. Every value is computed from figures a platform
 * genuinely reported, and every formula is written out so a number on the
 * screen can be traced back to the arithmetic that produced it.
 *
 * ## The rule that governs all of it
 *
 * **A derived metric is only computed when every input is genuinely present.**
 * Treating a missing `shares` as zero would silently understate engagement on
 * a platform that does not report shares, and the resulting figure would be
 * compared against a platform that does — which is a false comparison dressed
 * as a number.
 *
 * So `engagements` on Instagram (likes + comments + shares + saves) and
 * `engagements` on YouTube (likes + comments + shares) are **different sums**,
 * and the formula is carried alongside the value so nothing has to guess.
 */

export interface DerivedFormula {
  metric: MetricName;
  /** Human-readable, and shown in the interface beside the figure. */
  formula: string;
  /** The canonical metrics this derivation consumed. */
  inputs: readonly MetricName[];
}

/**
 * Which metrics count as engagement, per platform.
 *
 * Deliberately per-platform rather than a single list: the platforms report
 * different interactions, and summing over a union would score a platform down
 * for a metric it never had the chance to report.
 */
export const ENGAGEMENT_INPUTS: Record<VariantPlatform, readonly MetricName[]> =
  {
    youtube: ["likes", "comments", "shares"],
    instagram: ["likes", "comments", "shares", "saves"],
    // No adapter, so no engagement can be derived from API data. Manually
    // entered figures are summed over whatever the owner actually recorded.
    tiktok: ["likes", "comments", "shares"],
  };

/** A map of the metrics available for one post, from one observation. */
export type MetricMap = Partial<
  Record<MetricName, { value: number; rawName: string }>
>;

export interface DeriveContext {
  platform: VariantPlatform;
  source: MetricSource;
  window: ObservationWindow;
  observedAt: string;
  fetchedAt: string;
}

/**
 * Total interactions.
 *
 * Returns `unavailable` when **any** expected input is missing, rather than
 * summing what happens to be there. A partial sum presented as a total is the
 * kind of number that survives into a decision.
 */
export function deriveEngagements(
  metrics: MetricMap,
  context: DeriveContext,
): MetricReading {
  const inputs = ENGAGEMENT_INPUTS[context.platform] ?? [];

  // Only inputs this platform is documented to report are required. Asking
  // Instagram for shares it does report and YouTube for saves it does not
  // would make YouTube permanently underivable.
  const expected = inputs.filter(
    (metric) =>
      context.source === "manual" || reportsMetric(context.platform, metric),
  );

  if (expected.length === 0) {
    return unavailable("engagements", "metric_unsupported");
  }

  const present = expected.filter((metric) => metrics[metric] !== undefined);

  if (present.length !== expected.length) {
    // Some inputs are missing. That is "not measured", not "no engagement".
    return unavailable("engagements", "not_yet_fetched");
  }

  const total = present.reduce(
    (sum, metric) => sum + (metrics[metric]?.value ?? 0),
    0,
  );

  return reading({
    metric: "engagements",
    value: total,
    source: context.source,
    rawName: `derived: ${present.join(" + ")}`,
    observedAt: context.observedAt,
    fetchedAt: context.fetchedAt,
    window: context.window,
  });
}

/**
 * Engagement as a percentage of the audience that saw it.
 *
 * The denominator matters and differs by platform: Instagram reports `reach`,
 * which is people, and YouTube reports `views`, which is plays. Dividing by
 * whichever the platform has and **saying which** is honest; silently using
 * different denominators and printing both as "engagement rate" is not.
 *
 * Returns `unavailable` when the denominator is zero — a rate over no audience
 * is undefined, not 0%.
 */
export function deriveEngagementRate(
  metrics: MetricMap,
  context: DeriveContext,
): MetricReading {
  const engagements = deriveEngagements(metrics, context);
  if (!engagements.available) {
    return unavailable("engagement_rate", engagements.reason);
  }

  // Reach where the platform reports it, views otherwise. Named in the raw
  // name so the figure can be interpreted correctly.
  const denominatorMetric: MetricName =
    metrics.reach !== undefined ? "reach" : "views_or_plays";
  const denominator = metrics[denominatorMetric]?.value;

  if (denominator === undefined) {
    return unavailable("engagement_rate", "not_yet_fetched");
  }

  if (denominator <= 0) {
    // Genuinely no audience yet. A rate would be a division by zero, and 0%
    // would claim people saw it and did not engage.
    return unavailable("engagement_rate", "not_yet_fetched");
  }

  return reading({
    metric: "engagement_rate",
    value: (engagements.value / denominator) * 100,
    source: context.source,
    rawName: `derived: engagements ÷ ${denominatorMetric} × 100`,
    observedAt: context.observedAt,
    fetchedAt: context.fetchedAt,
    window: context.window,
  });
}

/**
 * The formula behind a derived metric, for display.
 *
 * The interface shows this beside the number. A derived figure whose
 * derivation is invisible is a figure nobody can argue with, which is the
 * opposite of what a growth dashboard is for.
 */
export function formulaFor(
  metric: MetricName,
  platform: VariantPlatform,
  denominatorMetric: MetricName = "views_or_plays",
): DerivedFormula | null {
  const inputs = ENGAGEMENT_INPUTS[platform] ?? [];

  switch (metric) {
    case "engagements":
      return {
        metric,
        formula: inputs.join(" + "),
        inputs,
      };
    case "engagement_rate":
      return {
        metric,
        formula: `(${inputs.join(" + ")}) ÷ ${denominatorMetric} × 100`,
        inputs: [...inputs, denominatorMetric],
      };
    default:
      return null;
  }
}

/**
 * Average view duration, when a platform reports watch time and views but not
 * the average itself.
 *
 * Only computed where both inputs exist. Instagram reports neither, so this
 * never fires for Instagram — which is correct, and better than an average
 * derived from figures that measure different things.
 */
export function deriveAverageViewDuration(
  metrics: MetricMap,
  context: DeriveContext,
): MetricReading {
  const existing = metrics.average_view_duration_seconds;
  if (existing !== undefined) {
    return reading({
      metric: "average_view_duration_seconds",
      value: existing.value,
      source: context.source,
      rawName: existing.rawName,
      observedAt: context.observedAt,
      fetchedAt: context.fetchedAt,
      window: context.window,
    });
  }

  const watchTime = metrics.watch_time_seconds?.value;
  const views = metrics.views_or_plays?.value;

  if (watchTime === undefined || views === undefined) {
    return unavailable("average_view_duration_seconds", "metric_unsupported");
  }
  if (views <= 0) {
    return unavailable("average_view_duration_seconds", "not_yet_fetched");
  }

  return reading({
    metric: "average_view_duration_seconds",
    value: watchTime / views,
    source: context.source,
    rawName: "derived: watch_time_seconds ÷ views_or_plays",
    observedAt: context.observedAt,
    fetchedAt: context.fetchedAt,
    window: context.window,
  });
}
