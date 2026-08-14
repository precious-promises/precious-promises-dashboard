import type { MetricName, MetricReading } from "@/lib/analytics/types";
import { unavailable } from "@/lib/analytics/types";
import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Growth goals.
 *
 * **A goal is a target, never a prediction.** Nothing here forecasts, projects
 * or estimates what will happen — it records what Dave decided to aim at, and
 * compares it against what has actually been measured.
 *
 * The distinction matters most when there is nothing to compare against.
 * Progress toward a goal whose metric has never been measured is **unknown**,
 * not 0%. Rendering it as 0% would tell him he had achieved nothing when the
 * truth is that nobody has looked.
 */

export const GOAL_METRICS = [
  "posts_published",
  "views_or_plays",
  "watch_time_seconds",
  "engagements",
  "followers_gained",
] as const;

export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  posts_published: "Posts published",
  views_or_plays: "Views / plays",
  watch_time_seconds: "Watch time",
  engagements: "Engagements",
  followers_gained: "Followers gained",
};

export const GOAL_STATUSES = [
  "active",
  "achieved",
  "missed",
  "abandoned",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  achieved: "Achieved",
  missed: "Missed",
  abandoned: "Abandoned",
};

export interface GrowthGoal {
  id: string;
  owner_id: string;
  name: string;
  metric: GoalMetric;
  platform: VariantPlatform | null;
  target_value: number;
  period_start: string;
  period_end: string;
  status: GoalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * How far along a goal is.
 *
 * `progress` is a `MetricReading`, not a number, for the same reason every
 * other figure in this system is: the difference between "no progress" and "no
 * measurement" has to survive all the way to the screen.
 */
export interface GoalProgress {
  goal: GrowthGoal;
  /** What has actually been measured toward it. */
  achieved: MetricReading;
  /** Percentage of the target, or `null` when nothing has been measured. */
  percent: number | null;
  /** Days left in the goal's period. Negative once it has passed. */
  daysRemaining: number;
}

/**
 * Measure a goal against what has been observed.
 *
 * `achieved` is passed in rather than computed here so the caller controls
 * which observations count — and so this function stays pure and testable.
 *
 * **Returns `percent: null` when the metric is unmeasured.** That null travels
 * to the interface, which shows "Not measured yet" rather than a progress bar
 * sitting at zero.
 */
export function measureGoal(
  goal: GrowthGoal,
  achieved: MetricReading,
  now: Date = new Date(),
): GoalProgress {
  const end = Date.parse(goal.period_end);
  const daysRemaining = Number.isNaN(end)
    ? 0
    : Math.ceil((end - now.getTime()) / 86_400_000);

  if (!achieved.available) {
    return {
      goal,
      achieved,
      // Not 0. Nobody has looked.
      percent: null,
      daysRemaining,
    };
  }

  return {
    goal,
    achieved,
    percent:
      goal.target_value > 0 ? (achieved.value / goal.target_value) * 100 : null,
    daysRemaining,
  };
}

/** A goal whose metric cannot currently be measured at all. */
export function unmeasurableGoal(
  goal: GrowthGoal,
  reason: Parameters<typeof unavailable>[1],
  now: Date = new Date(),
): GoalProgress {
  return measureGoal(goal, unavailable(goal.metric as MetricName, reason), now);
}

/**
 * What to show beside a goal.
 *
 * Deliberately never says "on track" or "projected to reach" — both would be
 * forecasts, and a goal is not a forecast. It states what has been measured
 * against what was aimed at, and nothing more.
 */
export function describeProgress(progress: GoalProgress): string {
  if (progress.percent === null) {
    return progress.achieved.available
      ? "This goal has no target to measure against."
      : "Nothing has been measured toward this goal yet — which is not the same as no progress.";
  }

  const rounded = Math.round(progress.percent);
  const remaining =
    progress.daysRemaining > 0
      ? `${progress.daysRemaining} ${progress.daysRemaining === 1 ? "day" : "days"} left`
      : "the period has ended";

  return `${rounded}% of the target has been measured, with ${remaining}.`;
}
