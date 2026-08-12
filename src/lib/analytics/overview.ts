import type { SocialAccount } from "@/lib/accounts/types";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import type { ContentItem } from "@/lib/content/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PlatformVariant, VariantPlatform } from "@/lib/variants/types";
import { buildAnalysedPost, type AnalysedPost } from "@/lib/growth/analysis";

import {
  deriveEngagementRate,
  deriveEngagements,
  type MetricMap,
} from "./derive";
import { assessAnalyticsReadiness, type AnalyticsReadiness } from "./readiness";
import { latestPerPost, loadSnapshots, loadSyncRuns } from "./repository";
import {
  reading,
  unavailable,
  type MetricName,
  type MetricReading,
  type SnapshotWithMetrics,
} from "./types";

/**
 * Everything the Analytics and Growth pages need, assembled once.
 *
 * The pages are Server Components and this is the only place that queries, so
 * neither page issues a request per row — an overview over a year of content
 * would otherwise be a few hundred round trips.
 *
 * The important part is what happens when there is nothing: this returns an
 * honest `AnalyticsOverview` with readiness explaining *why* there is nothing,
 * rather than an object full of zeroes that the page would render as a
 * ministry nobody watched.
 */

export interface AnalyticsOverview {
  readiness: AnalyticsReadiness[];
  /** Posts genuinely published, whether or not they have been measured. */
  publishedCount: number;
  /** Of those, how many carry at least one metric. */
  measuredCount: number;
  /** Latest reading per post, for ranking and grouping. */
  posts: AnalysedPost[];
  /** Headline totals. Each is a reading, so absence stays visible. */
  totals: Record<MetricName, MetricReading>;
  /** When anything was last fetched, across all platforms. */
  lastFetchedAt: string | null;
  /** Whether any analytics exist at all. */
  hasAnyData: boolean;
}

const HEADLINE_METRICS: MetricName[] = [
  "views_or_plays",
  "watch_time_seconds",
  "engagements",
  "followers_gained",
];

/** Turn a stored snapshot's metric rows into the map the derivations want. */
export function metricMapOf(entry: SnapshotWithMetrics): MetricMap {
  const map: MetricMap = {};
  for (const row of entry.metrics) {
    map[row.metric_name] = {
      value: Number(row.metric_value),
      rawName: row.raw_metric_name,
    };
  }
  return map;
}

/**
 * Sum one metric across posts.
 *
 * Returns `unavailable` when **no** post carries it — a total of zero over
 * nothing measured is the exact lie this stage exists to prevent. A genuine
 * zero across measured posts returns `0`, because that is a measurement.
 */
export function totalFor(
  entries: readonly SnapshotWithMetrics[],
  metric: MetricName,
): MetricReading {
  const contributing = entries
    .map((entry) => ({
      entry,
      row: entry.metrics.find((row) => row.metric_name === metric),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        entry: SnapshotWithMetrics;
        row: NonNullable<typeof candidate.row>;
      } => candidate.row !== undefined,
    );

  if (contributing.length === 0) {
    return unavailable(metric, "not_yet_fetched");
  }

  const total = contributing.reduce(
    (sum, candidate) => sum + Number(candidate.row.metric_value),
    0,
  );

  // The newest contributing observation dates the total.
  const newest = contributing.reduce((latest, candidate) =>
    Date.parse(candidate.entry.snapshot.observed_at) >
    Date.parse(latest.entry.snapshot.observed_at)
      ? candidate
      : latest,
  );

  return reading({
    metric,
    value: total,
    source: newest.entry.snapshot.source,
    rawName: `sum of ${contributing.length} observed ${contributing.length === 1 ? "post" : "posts"}`,
    observedAt: newest.entry.snapshot.observed_at,
    fetchedAt: newest.entry.snapshot.fetched_at,
    window: newest.entry.snapshot.observation_window,
  });
}

export async function loadAnalyticsOverview(): Promise<AnalyticsOverview> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: AnalyticsOverview = {
    readiness: [],
    publishedCount: 0,
    measuredCount: 0,
    posts: [],
    totals: {} as Record<MetricName, MetricReading>,
    lastFetchedAt: null,
    hasAnyData: false,
  };

  if (!user) {
    return empty;
  }

  const [accounts, runs, snapshots] = await Promise.all([
    loadSocialAccounts(),
    loadSyncRuns(),
    loadSnapshots({ window: "lifetime" }),
  ]);

  const platforms: VariantPlatform[] = ["youtube", "instagram", "tiktok"];

  const readiness = platforms.map((platform) => {
    const account =
      accounts.find(
        (candidate: SocialAccount) => candidate.platform === platform,
      ) ?? null;

    return assessAnalyticsReadiness({
      platform,
      account,
      publishingAuthorised: account !== null && account.status === "connected",
      runs,
    });
  });

  // Published posts, whether or not anything has measured them. This is the
  // denominator that makes "0 of 12 posts measured" sayable.
  const { data: postRows } = await supabase
    .from("scheduled_posts")
    .select(
      "id, platform_variant_id, external_post_id, posted_at, external_availability",
    )
    .eq("owner_id", user.id)
    .eq("status", "posted")
    .not("external_post_id", "is", null);

  const publishedPosts = (postRows ?? []) as {
    id: string;
    platform_variant_id: string;
    external_post_id: string;
    posted_at: string | null;
  }[];

  const latest = latestPerPost(snapshots);

  if (publishedPosts.length === 0) {
    return {
      ...empty,
      readiness,
      totals: buildTotals([]),
    };
  }

  const [{ data: variantRows }, { data: assetRows }] = await Promise.all([
    supabase
      .from("platform_variants")
      .select("*")
      .eq("owner_id", user.id)
      .in(
        "id",
        publishedPosts.map((post) => post.platform_variant_id),
      ),
    supabase
      .from("media_assets")
      .select("id, duration_seconds")
      .eq("owner_id", user.id),
  ]);

  const variants = (variantRows ?? []) as PlatformVariant[];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const { data: itemRows } = await supabase
    .from("content_items")
    .select("*")
    .eq("owner_id", user.id)
    .in("id", [...new Set(variants.map((variant) => variant.content_item_id))]);

  const itemById = new Map(
    ((itemRows ?? []) as ContentItem[]).map((item) => [item.id, item]),
  );

  // Duration comes from the primary media asset for the item.
  const { data: linkRows } = await supabase
    .from("content_media")
    .select("content_item_id, media_asset_id, purpose")
    .eq("purpose", "primary");

  const durationByItem = new Map<string, number | null>();
  const assetDurations = new Map(
    (
      (assetRows ?? []) as { id: string; duration_seconds: number | null }[]
    ).map((asset) => [asset.id, asset.duration_seconds]),
  );
  for (const link of (linkRows ?? []) as {
    content_item_id: string;
    media_asset_id: string;
  }[]) {
    if (!durationByItem.has(link.content_item_id)) {
      durationByItem.set(
        link.content_item_id,
        assetDurations.get(link.media_asset_id) ?? null,
      );
    }
  }

  const snapshotByExternal = new Map(
    latest.map((entry) => [
      `${entry.snapshot.platform}:${entry.snapshot.external_post_id}`,
      entry,
    ]),
  );

  const posts: AnalysedPost[] = [];
  let measuredCount = 0;

  for (const post of publishedPosts) {
    const variant = variantById.get(post.platform_variant_id);
    if (variant === undefined) {
      continue;
    }

    const item = itemById.get(variant.content_item_id) ?? null;
    const entry = snapshotByExternal.get(
      `${variant.platform}:${post.external_post_id}`,
    );

    const metrics: Partial<Record<MetricName, number>> = {};

    if (entry !== undefined) {
      measuredCount += 1;
      const map = metricMapOf(entry);

      for (const [name, value] of Object.entries(map)) {
        metrics[name as MetricName] = value.value;
      }

      // Derived figures are computed here rather than stored, so a change to
      // a formula does not require rewriting history.
      const context = {
        platform: variant.platform,
        source: entry.snapshot.source,
        window: entry.snapshot.observation_window,
        observedAt: entry.snapshot.observed_at,
        fetchedAt: entry.snapshot.fetched_at,
      };

      const engagements = deriveEngagements(map, context);
      if (engagements.available) {
        metrics.engagements = engagements.value;
      }

      const rate = deriveEngagementRate(map, context);
      if (rate.available) {
        metrics.engagement_rate = rate.value;
      }
    }

    posts.push(
      buildAnalysedPost({
        scheduledPostId: post.id,
        platform: variant.platform,
        externalPostId: post.external_post_id,
        postedAt: post.posted_at,
        item,
        variant: {
          variant_type: variant.variant_type,
          title: variant.title,
          thumbnail_text: variant.thumbnail_text,
          cta: variant.cta,
        },
        durationSeconds: item ? (durationByItem.get(item.id) ?? null) : null,
        metrics,
        observationHours: null,
      }),
    );
  }

  const lastFetchedAt =
    latest.length === 0
      ? null
      : latest
          .map((entry) => entry.snapshot.fetched_at)
          .sort()
          .reverse()[0];

  return {
    readiness,
    publishedCount: publishedPosts.length,
    measuredCount,
    posts,
    totals: buildTotals(latest),
    lastFetchedAt,
    hasAnyData: latest.length > 0,
  };
}

function buildTotals(
  entries: readonly SnapshotWithMetrics[],
): Record<MetricName, MetricReading> {
  const totals = {} as Record<MetricName, MetricReading>;

  for (const metric of HEADLINE_METRICS) {
    if (metric === "engagements") {
      // Derived per post and then summed, rather than summed from a stored
      // total that no platform ever reported.
      const perPost = entries
        .map((entry) => {
          const map = metricMapOf(entry);
          return deriveEngagements(map, {
            platform: entry.snapshot.platform,
            source: entry.snapshot.source,
            window: entry.snapshot.observation_window,
            observedAt: entry.snapshot.observed_at,
            fetchedAt: entry.snapshot.fetched_at,
          });
        })
        .filter((value) => value.available);

      if (perPost.length === 0) {
        totals[metric] = unavailable(metric, "not_yet_fetched");
      } else {
        const sum = perPost.reduce(
          (running, value) => running + (value.available ? value.value : 0),
          0,
        );
        const newest = perPost[0];
        totals[metric] = reading({
          metric,
          value: sum,
          source: newest.available ? newest.source : "manual",
          rawName: `derived across ${perPost.length} measured posts`,
          observedAt: newest.available ? newest.observedAt : "",
          fetchedAt: newest.available ? newest.fetchedAt : "",
          window: newest.available ? newest.window : "lifetime",
        });
      }
      continue;
    }

    totals[metric] = totalFor(entries, metric);
  }

  return totals;
}
