import type { ContentItem } from "@/lib/content/types";
import type { MetricName } from "@/lib/analytics/types";
import { DEFAULT_TIMEZONE } from "@/lib/schedule/timezone";
import type { VariantPlatform } from "@/lib/variants/types";

import {
  assessConfidence,
  consistencyOf,
  describeFinding,
  MINIMUM_COMPARABLE_POSTS,
  type ConfidenceAssessment,
} from "./confidence";

/**
 * Comparing content against content.
 *
 * ## The comparison set is the whole argument
 *
 * A two-hour sleep video and a thirty-second Reel do not compete. Comparing
 * them would produce a "finding" that long-form underperforms, which would be
 * an artefact of the format rather than an observation about the content.
 *
 * So every comparison here happens **within a set**: same platform, same
 * broad format, comparable age. Nothing is ranked against something it was
 * never in the same category as, and a set too small to be a set says so.
 *
 * ## Nothing is classified by AI
 *
 * Topic comes from the stored `topic` field, which a human typed. Title
 * patterns are deterministic string properties — does it end in a question
 * mark, does it contain a Scripture reference, how long is it. Stage 10 makes
 * no judgement about whether a hook is *good*; it reports what is there and
 * what performed, and leaves the interpretation where it belongs.
 */

// ---------------------------------------------------------------------------
// A post, as analysis sees it
// ---------------------------------------------------------------------------

export interface AnalysedPost {
  scheduledPostId: string;
  platform: VariantPlatform;
  contentItemId: string | null;
  externalPostId: string;

  /** When it went out, as a UTC instant. */
  postedAt: string | null;

  // Dimensions, all read from stored records.
  topic: string | null;
  contentType: string | null;
  variantType: string | null;
  durationSeconds: number | null;
  title: string | null;
  thumbnailText: string | null;
  cta: string | null;
  scriptureReference: string | null;

  /** Canonical metric values from the latest observation. Absent = unmeasured. */
  metrics: Partial<Record<MetricName, number>>;

  /** Hours between publication and the observation these metrics came from. */
  observationHours: number | null;
}

// ---------------------------------------------------------------------------
// Comparison sets
// ---------------------------------------------------------------------------

/**
 * Duration bands.
 *
 * Derived from the shapes this product actually makes — Shorts and Reels under
 * a minute, mid-length teaching, long-form — rather than from any claim about
 * what an algorithm prefers. No platform documents a duration preference this
 * application could cite, so none is asserted.
 */
export const DURATION_BANDS = ["short", "medium", "long", "unknown"] as const;
export type DurationBand = (typeof DURATION_BANDS)[number];

export const DURATION_BAND_LABELS: Record<DurationBand, string> = {
  short: "Under 1 minute",
  medium: "1–10 minutes",
  long: "Over 10 minutes",
  unknown: "Duration not recorded",
};

export function durationBand(seconds: number | null): DurationBand {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "unknown";
  }
  if (seconds < 60) {
    return "short";
  }
  if (seconds <= 600) {
    return "medium";
  }
  return "long";
}

/**
 * The key that decides what competes with what.
 *
 * Platform and duration band. Not topic — topic is what is being *compared*,
 * so including it would put every post in a set of one.
 */
export function comparisonKey(post: AnalysedPost): string {
  return `${post.platform}:${durationBand(post.durationSeconds)}`;
}

/** Posts grouped into sets that can legitimately be compared. */
export function comparisonSets(
  posts: readonly AnalysedPost[],
): Map<string, AnalysedPost[]> {
  const sets = new Map<string, AnalysedPost[]>();

  for (const post of posts) {
    const key = comparisonKey(post);
    const list = sets.get(key) ?? [];
    list.push(post);
    sets.set(key, list);
  }

  return sets;
}

// ---------------------------------------------------------------------------
// Grouped findings
// ---------------------------------------------------------------------------

export interface GroupFinding {
  /** What the group is — a topic, a weekday, a duration band. */
  groupKey: string;
  groupLabel: string;
  /** Posts in this group. */
  postCount: number;
  /** Of those, how many carry the metric. */
  measuredCount: number;
  /** The group's mean, and the mean of everything it is being compared to. */
  groupMean: number | null;
  baselineMean: number | null;
  /** Percent difference from the baseline. Null when either mean is missing. */
  differencePercent: number | null;
  confidence: ConfidenceAssessment;
  /** The sentence the interface shows. Never claims causation. */
  headline: string;
}

function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hoursSince(iso: string | null, now: Date): number {
  if (iso === null) {
    return 0;
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return 0;
  }
  return Math.max(0, (now.getTime() - then) / 3_600_000);
}

/**
 * Compare one grouping of posts against everything else in the same
 * comparison set.
 *
 * The baseline is **the rest of the comparable posts**, not all posts: a
 * YouTube long-form group compared against a global average that includes
 * Reels would be comparing itself against a different medium.
 */
export function analyseGrouping(input: {
  posts: readonly AnalysedPost[];
  metric: MetricName;
  /** How to group. Returning null excludes a post from the analysis. */
  groupBy: (post: AnalysedPost) => { key: string; label: string } | null;
  now?: Date;
}): GroupFinding[] {
  const now = input.now ?? new Date();
  const findings: GroupFinding[] = [];

  // Only posts inside a comparison set large enough to have a baseline.
  for (const [, set] of comparisonSets(input.posts)) {
    const groups = new Map<string, { label: string; posts: AnalysedPost[] }>();

    for (const post of set) {
      const group = input.groupBy(post);
      if (group === null) {
        continue;
      }
      const existing = groups.get(group.key) ?? {
        label: group.label,
        posts: [],
      };
      existing.posts.push(post);
      groups.set(group.key, existing);
    }

    for (const [key, group] of groups) {
      const others = set.filter((post) => {
        const g = input.groupBy(post);
        return g !== null && g.key !== key;
      });

      const groupValues = group.posts
        .map((post) => post.metrics[input.metric])
        .filter((value): value is number => typeof value === "number");

      const baselineValues = others
        .map((post) => post.metrics[input.metric])
        .filter((value): value is number => typeof value === "number");

      const groupMean = meanOf(groupValues);
      const baselineMean = meanOf(baselineValues);

      const youngestHours = group.posts.reduce(
        (min, post) => Math.min(min, hoursSince(post.postedAt, now)),
        Number.POSITIVE_INFINITY,
      );

      const confidence = assessConfidence({
        comparablePosts: group.posts.length,
        postsWithMetric: groupValues.length,
        youngestObservationHours: Number.isFinite(youngestHours)
          ? youngestHours
          : 0,
        consistency:
          baselineMean === null ? 0 : consistencyOf(groupValues, baselineMean),
      });

      const differencePercent =
        groupMean !== null && baselineMean !== null && baselineMean > 0
          ? ((groupMean - baselineMean) / baselineMean) * 100
          : null;

      findings.push({
        groupKey: key,
        groupLabel: group.label,
        postCount: group.posts.length,
        measuredCount: groupValues.length,
        groupMean,
        baselineMean,
        differencePercent,
        confidence,
        headline:
          differencePercent === null
            ? `Not enough measured posts to compare ${group.label}.`
            : describeFinding({
                groupLabel: group.label,
                metricLabel: input.metric.replace(/_/g, " "),
                direction: differencePercent >= 0 ? "higher" : "lower",
                differencePercent,
                level: confidence.level,
              }),
      });
    }
  }

  return findings.sort(
    (a, b) =>
      (b.differencePercent ?? -Infinity) - (a.differencePercent ?? -Infinity),
  );
}

// ---------------------------------------------------------------------------
// The specific groupings
// ---------------------------------------------------------------------------

/**
 * The pillars this product organises around.
 *
 * Used only to give a stored topic a tidy display label when it matches one.
 * A topic that matches nothing here is kept exactly as Dave typed it — this
 * list never reclassifies content, and nothing infers a topic from verse text.
 */
export const CONTENT_PILLARS = [
  "Healing",
  "Love",
  "Peace",
  "Protection",
  "Faith",
  "Strength",
  "Salvation",
  "General",
] as const;

export function normalisePillar(topic: string | null): string | null {
  const trimmed = (topic ?? "").trim();
  if (trimmed === "") {
    return null;
  }

  const match = CONTENT_PILLARS.find(
    (pillar) => pillar.toLowerCase() === trimmed.toLowerCase(),
  );

  // A known pillar gets its canonical casing; anything else is the owner's own
  // word for it, kept verbatim.
  return match ?? trimmed;
}

export function byTopic(post: AnalysedPost) {
  const pillar = normalisePillar(post.topic);
  return pillar === null ? null : { key: pillar, label: pillar };
}

export function byDurationBand(post: AnalysedPost) {
  const band = durationBand(post.durationSeconds);
  return band === "unknown"
    ? null
    : { key: band, label: DURATION_BAND_LABELS[band] };
}

/**
 * Grouping by the weekday a post went out, in the owner's timezone.
 *
 * Instants are stored UTC and converted here. A post published at 23:30 London
 * time is a Tuesday post to Dave and a Wednesday post to the database, and the
 * one that matters for "when should I post" is Dave's.
 */
export function byWeekday(timezone: string = DEFAULT_TIMEZONE) {
  return (post: AnalysedPost) => {
    if (post.postedAt === null) {
      return null;
    }

    const when = new Date(post.postedAt);
    if (Number.isNaN(when.getTime())) {
      return null;
    }

    const label = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      timeZone: timezone,
    }).format(when);

    return { key: label, label };
  };
}

/** Local time bands, again in the owner's timezone. */
export const TIME_BANDS = [
  { key: "early", label: "Before 9am", from: 0, to: 9 },
  { key: "morning", label: "9am – midday", from: 9, to: 12 },
  { key: "afternoon", label: "Midday – 5pm", from: 12, to: 17 },
  { key: "evening", label: "5pm – 9pm", from: 17, to: 21 },
  { key: "night", label: "After 9pm", from: 21, to: 24 },
] as const;

export function byTimeBand(timezone: string = DEFAULT_TIMEZONE) {
  return (post: AnalysedPost) => {
    if (post.postedAt === null) {
      return null;
    }

    const when = new Date(post.postedAt);
    if (Number.isNaN(when.getTime())) {
      return null;
    }

    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      }).format(when),
    );

    if (!Number.isFinite(hour)) {
      return null;
    }

    const band =
      TIME_BANDS.find((entry) => hour >= entry.from && hour < entry.to) ??
      TIME_BANDS[TIME_BANDS.length - 1];

    return { key: band.key, label: band.label };
  };
}

// ---------------------------------------------------------------------------
// Deterministic title and thumbnail patterns
// ---------------------------------------------------------------------------

/**
 * Properties of a title that can be established by looking at it.
 *
 * Nothing subjective. "Is this hook emotionally powerful" is a judgement, and
 * a judgement needs a model — which Stage 10 deliberately does not use. These
 * are facts about strings.
 */
export interface TitlePattern {
  isQuestion: boolean;
  containsScriptureReference: boolean;
  length: number;
  lengthBand: "short" | "medium" | "long";
}

/** Book chapter:verse, the shape a reference takes. Never parses the verse. */
const SCRIPTURE_REFERENCE = /\b(?:[1-3]\s*)?[A-Z][a-z]+\.?\s+\d+:\d+/;

export function titlePattern(title: string | null): TitlePattern | null {
  const text = (title ?? "").trim();
  if (text === "") {
    return null;
  }

  return {
    isQuestion: text.endsWith("?"),
    containsScriptureReference: SCRIPTURE_REFERENCE.test(text),
    length: text.length,
    lengthBand:
      text.length < 30 ? "short" : text.length <= 60 ? "medium" : "long",
  };
}

export function byTitleStyle(post: AnalysedPost) {
  const pattern = titlePattern(post.title);
  if (pattern === null) {
    return null;
  }

  const key = pattern.isQuestion ? "question" : "statement";
  return {
    key,
    label: pattern.isQuestion
      ? "Titles that ask a question"
      : "Titles that state",
  };
}

export function byScriptureInTitle(post: AnalysedPost) {
  const pattern = titlePattern(post.title);
  if (pattern === null) {
    return null;
  }

  return pattern.containsScriptureReference
    ? { key: "with_reference", label: "Titles carrying a Scripture reference" }
    : {
        key: "without_reference",
        label: "Titles without a Scripture reference",
      };
}

// ---------------------------------------------------------------------------
// Winners
// ---------------------------------------------------------------------------

export interface WinningPost {
  post: AnalysedPost;
  /** Where it sits in its own comparison set, 0–100. */
  percentile: number;
  metric: MetricName;
  value: number;
  /** How many posts it was ranked against. */
  comparedAgainst: number;
  /** The comparison set, in words. */
  comparisonLabel: string;
}

/**
 * The best-performing content, ranked honestly.
 *
 * **Percentile within a comparison set**, not a composite score. A single
 * opaque number that blended views, watch time and engagement would be
 * unarguable — nobody could tell why one post beat another, or disagree with
 * the weighting, because the weighting would be invisible.
 *
 * A set below the minimum size produces no winners at all. Declaring the best
 * of two posts is not a finding.
 */
export function findWinners(input: {
  posts: readonly AnalysedPost[];
  metric: MetricName;
  limit?: number;
}): WinningPost[] {
  const winners: WinningPost[] = [];

  for (const [key, set] of comparisonSets(input.posts)) {
    const measured = set
      .map((post) => ({ post, value: post.metrics[input.metric] }))
      .filter(
        (entry): entry is { post: AnalysedPost; value: number } =>
          typeof entry.value === "number",
      );

    if (measured.length < MINIMUM_COMPARABLE_POSTS) {
      continue;
    }

    const sorted = [...measured].sort((a, b) => a.value - b.value);

    for (const entry of measured) {
      const rank = sorted.findIndex((other) => other.post === entry.post);
      const percentile = (rank / (sorted.length - 1)) * 100;

      winners.push({
        post: entry.post,
        percentile,
        metric: input.metric,
        value: entry.value,
        comparedAgainst: measured.length,
        comparisonLabel: comparisonLabelFor(key),
      });
    }
  }

  return winners
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, input.limit ?? 10);
}

function comparisonLabelFor(key: string): string {
  const [platform, band] = key.split(":");
  const bandLabel =
    DURATION_BAND_LABELS[band as DurationBand] ?? "unknown duration";
  return `${platform} · ${bandLabel}`;
}

/** Whether a post is a standout rather than merely above average. */
export const WINNER_PERCENTILE = 75;

export function isWinner(entry: WinningPost): boolean {
  return entry.percentile >= WINNER_PERCENTILE;
}

// ---------------------------------------------------------------------------
// Building analysed posts
// ---------------------------------------------------------------------------

/** Pull the dimensions off the stored records. No inference, no AI. */
export function buildAnalysedPost(input: {
  scheduledPostId: string;
  platform: VariantPlatform;
  externalPostId: string;
  postedAt: string | null;
  item: Pick<
    ContentItem,
    "id" | "topic" | "content_type" | "scripture_reference"
  > | null;
  variant: {
    variant_type: string | null;
    title: string | null;
    thumbnail_text: string | null;
    cta: string | null;
  } | null;
  durationSeconds: number | null;
  metrics: Partial<Record<MetricName, number>>;
  observationHours: number | null;
}): AnalysedPost {
  return {
    scheduledPostId: input.scheduledPostId,
    platform: input.platform,
    contentItemId: input.item?.id ?? null,
    externalPostId: input.externalPostId,
    postedAt: input.postedAt,
    topic: input.item?.topic ?? null,
    contentType: input.item?.content_type ?? null,
    variantType: input.variant?.variant_type ?? null,
    durationSeconds: input.durationSeconds,
    title: input.variant?.title ?? null,
    thumbnailText: input.variant?.thumbnail_text ?? null,
    cta: input.variant?.cta ?? null,
    scriptureReference: input.item?.scripture_reference ?? null,
    metrics: input.metrics,
    observationHours: input.observationHours,
  };
}
