// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  deriveAverageViewDuration,
  deriveEngagementRate,
  deriveEngagements,
  ENGAGEMENT_INPUTS,
  formulaFor,
  type MetricMap,
} from "@/lib/analytics/derive";
import { mapMediaInsights } from "@/lib/analytics/instagram-provider";
import { totalFor } from "@/lib/analytics/overview";
import {
  analyticsCapabilityFor,
  isRetryableAnalyticsError,
  POST_GONE_ERRORS,
  reportsMetric,
  type AnalyticsErrorCategory,
} from "@/lib/analytics/providers";
import {
  assessAnalyticsReadiness,
  hasAnalyticsScopes,
} from "@/lib/analytics/readiness";
import {
  describeFreshness,
  formatReading,
  isStale,
  reading,
  unavailable,
  type MetricName,
  type SnapshotWithMetrics,
} from "@/lib/analytics/types";
import { windowsDueFor } from "@/lib/analytics/sync";
import {
  categoriseYouTubeAnalyticsError,
  mapReportRows,
} from "@/lib/analytics/youtube-provider";
import { YOUTUBE_ANALYTICS_SCOPE } from "@/lib/youtube/config";

/**
 * Analytics honesty.
 *
 * One invariant carries this entire stage:
 *
 *   **Zero is a measurement. Absence is not.**
 *
 * A dashboard that renders "0 views" when the truth is "YouTube is not
 * connected" teaches its owner that the numbers are decorative — and once he
 * believes that, the real numbers cannot reach him either. Every test below
 * exists to keep those two things apart.
 */

const NOW = new Date("2026-08-12T12:00:00Z");

function snapshot(
  overrides: Partial<SnapshotWithMetrics["snapshot"]> = {},
  metrics: { name: MetricName; value: number; raw: string }[] = [],
): SnapshotWithMetrics {
  return {
    snapshot: {
      id: "snap-1",
      owner_id: "owner-1",
      platform: "youtube",
      source: "youtube_api",
      external_post_id: "vid-1",
      social_account_id: "acct-1",
      scheduled_post_id: "post-1",
      platform_variant_id: "variant-1",
      content_item_id: "item-1",
      observation_window: "lifetime",
      period_start: null,
      period_end: null,
      observed_at: "2026-08-11T12:00:00Z",
      fetched_at: "2026-08-11T12:00:00Z",
      created_at: "2026-08-11T12:00:00Z",
      ...overrides,
    },
    metrics: metrics.map((metric, index) => ({
      id: `m-${index}`,
      owner_id: "owner-1",
      snapshot_id: "snap-1",
      metric_name: metric.name,
      raw_metric_name: metric.raw,
      metric_value: metric.value,
      metric_unit: "count" as const,
      created_at: "2026-08-11T12:00:00Z",
    })),
  };
}

// ---------------------------------------------------------------------------
// Zero versus absence
// ---------------------------------------------------------------------------

describe("zero is a measurement, absence is not", () => {
  it("prints a dash for every kind of absence, never a digit", () => {
    for (const reason of [
      "platform_not_connected",
      "analytics_permission_missing",
      "provider_not_supported",
      "not_yet_fetched",
      "fetch_failed",
      "metric_unsupported",
      "post_unavailable",
    ] as const) {
      const value = unavailable("views_or_plays", reason);
      expect(formatReading(value), reason).toBe("—");
      expect(formatReading(value), reason).not.toMatch(/\d/);
    }
  });

  it("prints a genuine zero as zero", () => {
    // The other half of the invariant. A post that really was seen by nobody
    // is a measurement, and hiding it would be its own dishonesty.
    const value = reading({
      metric: "views_or_plays",
      value: 0,
      source: "youtube_api",
      rawName: "views",
      observedAt: NOW.toISOString(),
      fetchedAt: NOW.toISOString(),
      window: "lifetime",
    });

    expect(formatReading(value)).toBe("0");
  });

  it("refuses to total a metric nobody has measured", () => {
    // Summing an empty set to 0 is the single easiest way to report a
    // ministry as having reached nobody.
    const total = totalFor([], "views_or_plays");

    expect(total.available).toBe(false);
    if (!total.available) {
      expect(total.reason).toBe("not_yet_fetched");
    }
  });

  it("totals a genuine zero across measured posts", () => {
    const total = totalFor(
      [snapshot({}, [{ name: "views_or_plays", value: 0, raw: "views" }])],
      "views_or_plays",
    );

    expect(total.available).toBe(true);
    if (total.available) {
      expect(total.value).toBe(0);
    }
  });

  it("keeps the last known figure when a refresh fails", () => {
    const last = reading({
      metric: "views_or_plays",
      value: 412,
      source: "youtube_api",
      rawName: "views",
      observedAt: "2026-08-10T12:00:00Z",
      fetchedAt: "2026-08-10T12:00:00Z",
      window: "lifetime",
    });

    const failed = unavailable("views_or_plays", "fetch_failed", last);

    expect(failed.available).toBe(false);
    if (!failed.available) {
      // Never blanked to zero. The figure survives with its own date on it.
      expect(failed.lastKnown?.value).toBe(412);
      expect(failed.lastKnown?.observedAt).toBe("2026-08-10T12:00:00Z");
    }
  });
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

describe("every figure carries where it came from", () => {
  it("records the platform's own metric name alongside ours", () => {
    const value = reading({
      metric: "watch_time_seconds",
      value: 3600,
      source: "youtube_api",
      rawName: "estimatedMinutesWatched (minutes, stored as seconds)",
      observedAt: NOW.toISOString(),
      fetchedAt: NOW.toISOString(),
      window: "lifetime",
    });

    expect(value.available && value.rawName).toMatch(/estimatedMinutesWatched/);
  });

  it("keeps manual entry distinguishable from API data", () => {
    const manual = reading({
      metric: "views_or_plays",
      value: 100,
      source: "manual",
      rawName: "entered by hand",
      observedAt: NOW.toISOString(),
      fetchedAt: NOW.toISOString(),
      window: "lifetime",
    });

    expect(manual.available && manual.source).toBe("manual");
  });
});

// ---------------------------------------------------------------------------
// Platform capability
// ---------------------------------------------------------------------------

describe("what each platform actually reports", () => {
  it("does not claim TikTok analytics", () => {
    const tiktok = analyticsCapabilityFor("tiktok");

    expect(tiktok.implemented).toBe(false);
    expect(tiktok.metrics).toEqual([]);
    expect(tiktok.unavailableReason).toBe("provider_not_supported");
    expect(tiktok.detail).toMatch(/Research API/);
  });

  it("does not claim watch time for Instagram", () => {
    // Meta exposes no watch-time metric through this API. Showing an empty
    // column would look like a failure; showing zero would look like nobody
    // watched. Neither is true, so the metric simply is not offered.
    expect(reportsMetric("instagram", "watch_time_seconds")).toBe(false);
    expect(reportsMetric("youtube", "watch_time_seconds")).toBe(true);
  });

  it("does not claim saves or reach for YouTube", () => {
    expect(reportsMetric("youtube", "saves")).toBe(false);
    expect(reportsMetric("youtube", "reach")).toBe(false);
    expect(reportsMetric("instagram", "saves")).toBe(true);
  });

  it("names the extra scope YouTube analytics needs", () => {
    expect(analyticsCapabilityFor("youtube").additionalScopes).toEqual([
      YOUTUBE_ANALYTICS_SCOPE,
    ]);
    // Instagram needs none — insights come through the publishing connection.
    expect(analyticsCapabilityFor("instagram").additionalScopes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe("connected is not measurable", () => {
  const account = {
    id: "acct-1",
    owner_id: "owner-1",
    platform: "youtube" as const,
    provider_account_id: "UC_x",
    display_name: null,
    handle: null,
    channel_id: "UC_x",
    channel_title: "Precious Promises",
    status: "connected" as const,
    granted_scopes: ["https://www.googleapis.com/auth/youtube.upload"],
    connected_at: "2026-08-01T00:00:00Z",
    disconnected_at: null,
    token_expires_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };

  it("reports a publishing-only connection as needing permission", () => {
    const readiness = assessAnalyticsReadiness({
      platform: "youtube",
      account,
      publishingAuthorised: true,
      runs: [],
    });

    expect(readiness.accountConnected).toBe(true);
    expect(readiness.publishingAuthorised).toBe(true);
    // The distinction the whole page rests on.
    expect(readiness.analyticsAuthorised).toBe(false);
    expect(readiness.blockedBy).toBe("analytics_permission_missing");
    expect(readiness.missingScopes).toContain(YOUTUBE_ANALYTICS_SCOPE);
  });

  it("recognises the analytics scope once granted", () => {
    expect(
      hasAnalyticsScopes("youtube", [
        "https://www.googleapis.com/auth/youtube.upload",
        YOUTUBE_ANALYTICS_SCOPE,
      ]),
    ).toBe(true);
  });

  it("distinguishes never-synced from disconnected", () => {
    const granted = {
      ...account,
      granted_scopes: [...account.granted_scopes, YOUTUBE_ANALYTICS_SCOPE],
    };

    const neverSynced = assessAnalyticsReadiness({
      platform: "youtube",
      account: granted,
      publishingAuthorised: true,
      runs: [],
    });
    const disconnected = assessAnalyticsReadiness({
      platform: "youtube",
      account: null,
      publishingAuthorised: false,
      runs: [],
    });

    expect(neverSynced.blockedBy).toBe("not_yet_fetched");
    expect(disconnected.blockedBy).toBe("platform_not_connected");
    // Two different states, two different reasons, neither of them zero.
    expect(neverSynced.blockedBy).not.toBe(disconnected.blockedBy);
  });

  it("reports an unsupported provider without pretending it is disconnected", () => {
    const readiness = assessAnalyticsReadiness({
      platform: "tiktok",
      account: { ...account, platform: "tiktok" },
      publishingAuthorised: true,
      runs: [],
    });

    expect(readiness.providerImplemented).toBe(false);
    expect(readiness.blockedBy).toBe("provider_not_supported");
  });
});

// ---------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------

describe("derived metrics are only derived from what exists", () => {
  const context = {
    platform: "instagram" as const,
    source: "instagram_api" as const,
    window: "lifetime" as const,
    observedAt: NOW.toISOString(),
    fetchedAt: NOW.toISOString(),
  };

  it("sums engagement from the platform's own interaction set", () => {
    const metrics: MetricMap = {
      likes: { value: 10, rawName: "likes" },
      comments: { value: 4, rawName: "comments" },
      shares: { value: 2, rawName: "shares" },
      saves: { value: 6, rawName: "saved" },
    };

    const result = deriveEngagements(metrics, context);

    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.value).toBe(22);
      expect(result.rawName).toMatch(/derived/);
    }
  });

  it("refuses to sum when an input is missing", () => {
    // A partial sum presented as a total is a number that survives into a
    // decision, and understates a platform against one that reports more.
    const partial: MetricMap = {
      likes: { value: 10, rawName: "likes" },
      comments: { value: 4, rawName: "comments" },
    };

    expect(deriveEngagements(partial, context).available).toBe(false);
  });

  it("uses a different engagement set per platform", () => {
    expect(ENGAGEMENT_INPUTS.instagram).toContain("saves");
    expect(ENGAGEMENT_INPUTS.youtube).not.toContain("saves");
  });

  it("refuses an engagement rate over no audience", () => {
    const metrics: MetricMap = {
      likes: { value: 0, rawName: "likes" },
      comments: { value: 0, rawName: "comments" },
      shares: { value: 0, rawName: "shares" },
      saves: { value: 0, rawName: "saved" },
      reach: { value: 0, rawName: "reach" },
    };

    // 0% would claim people saw it and did not engage. Nobody saw it.
    expect(deriveEngagementRate(metrics, context).available).toBe(false);
  });

  it("names the denominator it used", () => {
    const metrics: MetricMap = {
      likes: { value: 5, rawName: "likes" },
      comments: { value: 5, rawName: "comments" },
      shares: { value: 5, rawName: "shares" },
      saves: { value: 5, rawName: "saved" },
      reach: { value: 200, rawName: "reach" },
    };

    const rate = deriveEngagementRate(metrics, context);

    expect(rate.available).toBe(true);
    if (rate.available) {
      expect(rate.value).toBe(10);
      expect(rate.rawName).toMatch(/reach/);
    }
  });

  it("publishes the formula behind every derived metric", () => {
    const formula = formulaFor("engagement_rate", "instagram", "reach");

    expect(formula?.formula).toBe(
      "(likes + comments + shares + saves) ÷ reach × 100",
    );
  });

  it("does not derive an average duration without both inputs", () => {
    const result = deriveAverageViewDuration(
      { views_or_plays: { value: 100, rawName: "views" } },
      { ...context, platform: "youtube", source: "youtube_api" },
    );

    expect(result.available).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provider mapping
// ---------------------------------------------------------------------------

describe("mapping platform responses", () => {
  it("reads a YouTube report table into per-video metrics", () => {
    const body = {
      columnHeaders: [
        { name: "video" },
        { name: "views" },
        { name: "estimatedMinutesWatched" },
        { name: "likes" },
      ],
      rows: [
        ["vid-1", 500, 60, 25],
        ["vid-2", 120, 12, 3],
      ],
    };

    const mapped = mapReportRows(body, {
      window: "lifetime",
      observedAt: NOW,
      periodStart: null,
      periodEnd: null,
    });

    expect(mapped).toHaveLength(2);
    expect(mapped[0].externalPostId).toBe("vid-1");
    expect(mapped[0].values.views_or_plays?.value).toBe(500);
    // Minutes converted to seconds at the boundary, with the conversion
    // recorded so the stored figure stays checkable.
    expect(mapped[0].values.watch_time_seconds?.value).toBe(3600);
    expect(mapped[0].values.watch_time_seconds?.rawName).toMatch(/minutes/);
  });

  it("omits a YouTube cell it could not read rather than zeroing it", () => {
    const body = {
      columnHeaders: [{ name: "video" }, { name: "views" }, { name: "likes" }],
      rows: [["vid-1", 500, null]],
    };

    const mapped = mapReportRows(body, {
      window: "lifetime",
      observedAt: NOW,
      periodStart: null,
      periodEnd: null,
    });

    expect(mapped[0].values.views_or_plays?.value).toBe(500);
    // Number(null) is 0. That coercion is exactly the bug.
    expect(mapped[0].values.likes).toBeUndefined();
  });

  it("reads Instagram insights and omits metrics Meta did not return", () => {
    const body = {
      data: [
        { name: "views", values: [{ value: 900 }] },
        { name: "reach", values: [{ value: 700 }] },
        { name: "saved", values: [{ value: 40 }] },
      ],
    };

    const mapped = mapMediaInsights(body, {
      externalPostId: "ig-1",
      window: "lifetime",
      observedAt: NOW,
      periodStart: null,
      periodEnd: null,
    });

    expect(mapped.values.views_or_plays?.value).toBe(900);
    expect(mapped.values.views_or_plays?.rawName).toBe("views");
    expect(mapped.values.saves?.value).toBe(40);
    expect(mapped.values.likes).toBeUndefined();
  });

  it("distinguishes a missing scope from an exhausted quota", () => {
    // Both are 403 from Google and they need opposite responses: one is a
    // reconnection, the other is a retry later.
    expect(
      categoriseYouTubeAnalyticsError(403, {
        error: { message: "Insufficient permission" },
      }),
    ).toBe("permission_missing");

    expect(
      categoriseYouTubeAnalyticsError(403, {
        error: { message: "quotaExceeded" },
      }),
    ).toBe("rate_limited");
  });
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

describe("analytics failures never touch publishing", () => {
  it("treats a missing post as an availability fact, not a publish fact", () => {
    expect(POST_GONE_ERRORS).toContain("post_unavailable");
    expect(POST_GONE_ERRORS).toContain("invalid_external_id");
  });

  it("does not retry an unclassified failure", () => {
    const nonRetryable: AnalyticsErrorCategory[] = [
      "unknown",
      "permission_missing",
      "account_disconnected",
      "post_unavailable",
    ];

    for (const category of nonRetryable) {
      expect(isRetryableAnalyticsError(category), category).toBe(false);
    }

    expect(isRetryableAnalyticsError("rate_limited")).toBe(true);
    expect(isRetryableAnalyticsError("transient")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Windows and freshness
// ---------------------------------------------------------------------------

describe("observation windows", () => {
  it("only asks for a window that has closed", () => {
    const twoDaysOld = new Date(NOW.getTime() - 2 * 86_400_000).toISOString();
    const windows = windowsDueFor(twoDaysOld, NOW);

    expect(windows).toContain("first_24h");
    expect(windows).toContain("lifetime");
    // A window that has not closed would record a partial figure under a name
    // that claims completeness.
    expect(windows).not.toContain("first_7d");
    expect(windows).not.toContain("first_28d");
  });

  it("asks nothing for a post that was never published", () => {
    expect(windowsDueFor(null, NOW)).toEqual([]);
  });
});

describe("freshness is always stated", () => {
  it("says so when nothing has ever been fetched", () => {
    expect(describeFreshness(null)).toBe("Never fetched");
    expect(isStale(null)).toBe(true);
  });

  it("marks a weeks-old figure as stale", () => {
    const old = new Date(NOW.getTime() - 20 * 86_400_000).toISOString();

    expect(isStale(old, NOW)).toBe(true);
    expect(describeFreshness(old, NOW)).toMatch(/days ago/);
  });

  it("does not mark a figure read this morning as stale", () => {
    const recent = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();

    expect(isStale(recent, NOW)).toBe(false);
    expect(describeFreshness(recent, NOW)).toBe("3 hours ago");
  });
});
