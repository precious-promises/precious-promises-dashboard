import type { VariantPlatform } from "@/lib/variants/types";

/**
 * The analytics vocabulary.
 *
 * ## The one invariant
 *
 * **Zero is a measurement. Absence is not.**
 *
 * Every other decision in this module follows from that. A metric nobody has
 * fetched, a platform that refuses to report one, an account that was never
 * connected — none of those is `0`, and a dashboard that renders them as `0`
 * is telling Dave his ministry reached nobody when the truth is that nobody
 * asked.
 *
 * So a metric is never a bare number. It is a `MetricReading`: either a real
 * observation carrying a value and its provenance, or an explicit statement of
 * why there is nothing to show.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Where a number came from.
 *
 * `manual` is a first-class source rather than a fallback, and it is never
 * silently mixed with API data — every surface that shows a figure can say
 * which of these produced it. A hand-typed number and a number Meta returned
 * are both legitimate; presenting them as the same thing is not.
 */
export const METRIC_SOURCES = [
  "youtube_api",
  "instagram_api",
  "tiktok_api",
  "manual",
] as const;

export type MetricSource = (typeof METRIC_SOURCES)[number];

export const METRIC_SOURCE_LABELS: Record<MetricSource, string> = {
  youtube_api: "YouTube Analytics API",
  instagram_api: "Instagram Insights",
  tiktok_api: "TikTok API",
  manual: "Entered by hand",
};

export function isApiSource(source: MetricSource): boolean {
  return source !== "manual";
}

/** Which question an observation answers. */
export const OBSERVATION_WINDOWS = [
  "first_24h",
  "first_7d",
  "first_28d",
  "lifetime",
] as const;

export type ObservationWindow = (typeof OBSERVATION_WINDOWS)[number];

export const OBSERVATION_WINDOW_LABELS: Record<ObservationWindow, string> = {
  first_24h: "First 24 hours",
  first_7d: "First 7 days",
  first_28d: "First 28 days",
  lifetime: "Lifetime to date",
};

/** How long after publication each window closes. */
export const OBSERVATION_WINDOW_DAYS: Record<ObservationWindow, number | null> =
  {
    first_24h: 1,
    first_7d: 7,
    first_28d: 28,
    // Open-ended by definition: it keeps growing, so it is refreshed rather
    // than closed.
    lifetime: null,
  };

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * This system's canonical metric names.
 *
 * These are **normalisations, not equivalences.** `views_or_plays` is named
 * awkwardly on purpose: YouTube counts a view, Instagram counts a play, and
 * TikTok counts a video view, and the three are measured differently enough
 * that pretending otherwise would be a lie told in a chart. The name keeps the
 * seam visible, and `raw_metric_name` on every stored row keeps the platform's
 * own word for it so any figure can be traced back.
 */
export const METRIC_NAMES = [
  "views_or_plays",
  "watch_time_seconds",
  "average_view_duration_seconds",
  "likes",
  "comments",
  "shares",
  "saves",
  "reach",
  "followers_gained",
  // Derived. Never fetched — always computed from the above, and only when
  // every input is genuinely present.
  "engagements",
  "engagement_rate",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export const METRIC_LABELS: Record<MetricName, string> = {
  views_or_plays: "Views / plays",
  watch_time_seconds: "Watch time",
  average_view_duration_seconds: "Average view duration",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
  reach: "Reach",
  followers_gained: "Followers gained",
  engagements: "Engagements",
  engagement_rate: "Engagement rate",
};

export const METRIC_UNITS = ["count", "seconds", "percent", "ratio"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];

export const METRIC_UNIT_BY_NAME: Record<MetricName, MetricUnit> = {
  views_or_plays: "count",
  watch_time_seconds: "seconds",
  average_view_duration_seconds: "seconds",
  likes: "count",
  comments: "count",
  shares: "count",
  saves: "count",
  reach: "count",
  followers_gained: "count",
  engagements: "count",
  engagement_rate: "percent",
};

/** Metrics computed here rather than fetched. */
export const DERIVED_METRICS: readonly MetricName[] = [
  "engagements",
  "engagement_rate",
];

export function isDerived(metric: MetricName): boolean {
  return DERIVED_METRICS.includes(metric);
}

// ---------------------------------------------------------------------------
// Availability — the heart of it
// ---------------------------------------------------------------------------

/**
 * Why a number is not on the screen.
 *
 * Each of these renders differently and means something different to Dave.
 * Collapsing any two of them into "0" would answer a question nobody asked.
 */
export const UNAVAILABLE_REASONS = [
  "platform_not_connected",
  "analytics_permission_missing",
  "provider_not_supported",
  "not_yet_fetched",
  "fetch_failed",
  "metric_unsupported",
  "post_unavailable",
] as const;

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export const UNAVAILABLE_LABELS: Record<UnavailableReason, string> = {
  platform_not_connected: "Not connected",
  analytics_permission_missing: "Permission needed",
  provider_not_supported: "Not available from this platform",
  not_yet_fetched: "Not fetched yet",
  fetch_failed: "Last refresh failed",
  metric_unsupported: "Not reported",
  post_unavailable: "Post no longer reachable",
};

export const UNAVAILABLE_DETAIL: Record<UnavailableReason, string> = {
  platform_not_connected:
    "No account is connected for this platform, so nobody has been able to ask it anything.",
  analytics_permission_missing:
    "The account is connected, but without the permission needed to read its analytics. Reconnecting and granting it will start the figures flowing.",
  provider_not_supported:
    "This platform does not expose these figures through any API this dashboard can legitimately use.",
  not_yet_fetched:
    "Nothing has been fetched for this yet. It is not zero — it is unmeasured.",
  fetch_failed:
    "The most recent refresh failed. Any figures shown are the last ones successfully read, with the time they were read.",
  metric_unsupported:
    "This platform does not report this particular metric, so there is nothing to show rather than nothing to count.",
  post_unavailable:
    "The post can no longer be found at the platform. Its recorded history is kept exactly as observed.",
};

/**
 * A metric, or an honest account of its absence.
 *
 * The discriminated union is the enforcement mechanism: a caller cannot read
 * `.value` without first narrowing on `available`, so rendering a missing
 * metric as a number requires deliberately writing `?? 0` — which is exactly
 * the line a reviewer should catch.
 */
export type MetricReading =
  | {
      available: true;
      metric: MetricName;
      value: number;
      unit: MetricUnit;
      source: MetricSource;
      /** The platform's own name for this figure. */
      rawName: string;
      observedAt: string;
      fetchedAt: string;
      window: ObservationWindow;
    }
  | {
      available: false;
      metric: MetricName;
      reason: UnavailableReason;
      /**
       * The last figure successfully read, if there is one.
       *
       * Present when a refresh failed but older data survives. A failed fetch
       * never deletes a good observation.
       */
      lastKnown?: {
        value: number;
        unit: MetricUnit;
        source: MetricSource;
        observedAt: string;
      };
    };

/** A real observation. */
export function reading(input: {
  metric: MetricName;
  value: number;
  source: MetricSource;
  rawName: string;
  observedAt: string;
  fetchedAt: string;
  window: ObservationWindow;
  unit?: MetricUnit;
}): MetricReading {
  return {
    available: true,
    metric: input.metric,
    value: input.value,
    unit: input.unit ?? METRIC_UNIT_BY_NAME[input.metric],
    source: input.source,
    rawName: input.rawName,
    observedAt: input.observedAt,
    fetchedAt: input.fetchedAt,
    window: input.window,
  };
}

/** An honest absence. */
export function unavailable(
  metric: MetricName,
  reason: UnavailableReason,
  lastKnown?: MetricReading,
): MetricReading {
  return {
    available: false,
    metric,
    reason,
    lastKnown:
      lastKnown && lastKnown.available
        ? {
            value: lastKnown.value,
            unit: lastKnown.unit,
            source: lastKnown.source,
            observedAt: lastKnown.observedAt,
          }
        : undefined,
  };
}

/**
 * What to print.
 *
 * The single place that decides how a metric becomes text, so no component can
 * quietly choose `0`. An unavailable reading prints an em dash — never a digit.
 */
export function formatReading(value: MetricReading): string {
  if (!value.available) {
    return "—";
  }

  switch (value.unit) {
    case "seconds":
      return formatDuration(value.value);
    case "percent":
      return `${roundTo(value.value, 2)}%`;
    case "ratio":
      return String(roundTo(value.value, 3));
    default:
      return Math.round(value.value).toLocaleString("en-GB");
  }
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Stored shapes
// ---------------------------------------------------------------------------

export interface AnalyticsSnapshot {
  id: string;
  owner_id: string;
  platform: VariantPlatform;
  source: MetricSource;
  external_post_id: string;
  social_account_id: string | null;
  scheduled_post_id: string | null;
  platform_variant_id: string | null;
  content_item_id: string | null;
  observation_window: ObservationWindow;
  period_start: string | null;
  period_end: string | null;
  observed_at: string;
  fetched_at: string;
  created_at: string;
}

export interface AnalyticsMetricRow {
  id: string;
  owner_id: string;
  snapshot_id: string;
  metric_name: MetricName;
  raw_metric_name: string;
  metric_value: number;
  metric_unit: MetricUnit;
  created_at: string;
}

/** A snapshot with its metrics, as everything downstream consumes it. */
export interface SnapshotWithMetrics {
  snapshot: AnalyticsSnapshot;
  metrics: AnalyticsMetricRow[];
}

export const SYNC_STATUSES = [
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  partial: "Partly succeeded",
  failed: "Failed",
};

export interface AnalyticsSyncRun {
  id: string;
  owner_id: string;
  platform: VariantPlatform;
  trigger_source: "scheduled" | "manual";
  status: SyncStatus;
  error_category: string | null;
  error_detail: string | null;
  snapshots_written: number;
  posts_considered: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/**
 * How old a figure is, in words.
 *
 * Every analytics surface has to say this. A number read three weeks ago that
 * looks identical to one read this morning is the quiet way a dashboard stops
 * being trustworthy.
 */
export function describeFreshness(
  fetchedAt: string | null,
  now: Date = new Date(),
): string {
  if (fetchedAt === null) {
    return "Never fetched";
  }

  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) {
    return "Unknown";
  }

  const minutes = Math.floor((now.getTime() - then) / 60_000);

  if (minutes < 0) {
    return "Just now";
  }
  if (minutes < 2) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Whether a figure is old enough that the interface should say so loudly. */
export const STALE_AFTER_HOURS = 48;

export function isStale(
  fetchedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (fetchedAt === null) {
    return true;
  }
  const then = Date.parse(fetchedAt);
  if (Number.isNaN(then)) {
    return true;
  }
  return now.getTime() - then > STALE_AFTER_HOURS * 3_600_000;
}
