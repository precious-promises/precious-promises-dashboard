import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VariantPlatform } from "@/lib/variants/types";

import type {
  AnalyticsMetricRow,
  AnalyticsSnapshot,
  AnalyticsSyncRun,
  MetricName,
  MetricSource,
  ObservationWindow,
  SnapshotWithMetrics,
} from "./types";

/**
 * Reading and writing analytics.
 *
 * The split that matters: **the browser reads, the worker writes.** API-sourced
 * snapshots are inserted under the worker credential alone, because a browser
 * that could write an `instagram_api` row could manufacture performance data
 * and have it render as though Meta had reported it. The database enforces
 * this rather than trusting this module — the insert policy on
 * `analytics_snapshots` permits `source = 'manual'` and nothing else.
 *
 * The second rule: **nothing here deletes a snapshot.** A failed fetch writes a
 * sync-run row and leaves the data alone, so the interface can say "last
 * successful sync: Tuesday" instead of blanking every figure.
 */

const SNAPSHOT_COLUMNS =
  "id, owner_id, platform, source, external_post_id, social_account_id, scheduled_post_id, platform_variant_id, content_item_id, observation_window, period_start, period_end, observed_at, fetched_at, created_at";

// ---------------------------------------------------------------------------
// Reads (owner session, RLS applies)
// ---------------------------------------------------------------------------

/**
 * Every snapshot for this owner, newest first, with metrics attached.
 *
 * Two queries rather than one per snapshot: an overview page over a year of
 * content would otherwise issue hundreds of round trips.
 */
export async function loadSnapshots(options?: {
  platform?: VariantPlatform;
  window?: ObservationWindow;
  since?: Date;
  limit?: number;
}): Promise<SnapshotWithMetrics[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  let query = supabase
    .from("analytics_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("owner_id", user.id)
    .order("observed_at", { ascending: false });

  if (options?.platform) {
    query = query.eq("platform", options.platform);
  }
  if (options?.window) {
    query = query.eq("observation_window", options.window);
  }
  if (options?.since) {
    query = query.gte("observed_at", options.since.toISOString());
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;
  const snapshots = (data ?? []) as AnalyticsSnapshot[];

  if (snapshots.length === 0) {
    return [];
  }

  const { data: metricRows } = await supabase
    .from("analytics_metrics")
    .select("*")
    .eq("owner_id", user.id)
    .in(
      "snapshot_id",
      snapshots.map((snapshot) => snapshot.id),
    );

  const bySnapshot = new Map<string, AnalyticsMetricRow[]>();
  for (const row of (metricRows ?? []) as AnalyticsMetricRow[]) {
    const list = bySnapshot.get(row.snapshot_id) ?? [];
    list.push(row);
    bySnapshot.set(row.snapshot_id, list);
  }

  return snapshots.map((snapshot) => ({
    snapshot,
    metrics: bySnapshot.get(snapshot.id) ?? [],
  }));
}

/**
 * The most recent snapshot per post, for one window.
 *
 * "Latest" is per external post rather than overall — a post published
 * yesterday and one published last year both have a current reading, and
 * showing only the globally newest would hide everything else.
 */
export function latestPerPost(
  snapshots: readonly SnapshotWithMetrics[],
): SnapshotWithMetrics[] {
  const latest = new Map<string, SnapshotWithMetrics>();

  for (const entry of snapshots) {
    const key = `${entry.snapshot.platform}:${entry.snapshot.external_post_id}`;
    const existing = latest.get(key);

    if (
      existing === undefined ||
      Date.parse(entry.snapshot.observed_at) >
        Date.parse(existing.snapshot.observed_at)
    ) {
      latest.set(key, entry);
    }
  }

  return [...latest.values()];
}

export async function loadSyncRuns(limit = 40): Promise<AnalyticsSyncRun[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("analytics_sync_runs")
    .select("*")
    .eq("owner_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as AnalyticsSyncRun[];
}

// ---------------------------------------------------------------------------
// Writes (worker credential only for API sources)
// ---------------------------------------------------------------------------

export interface RecordSnapshotInput {
  ownerId: string;
  platform: VariantPlatform;
  source: MetricSource;
  externalPostId: string;
  socialAccountId?: string | null;
  scheduledPostId?: string | null;
  platformVariantId?: string | null;
  contentItemId?: string | null;
  window: ObservationWindow;
  periodStart: Date | null;
  periodEnd: Date | null;
  observedAt: Date;
  fetchedAt: Date;
  metrics: {
    name: MetricName;
    rawName: string;
    value: number;
    unit: "count" | "seconds" | "percent" | "ratio";
  }[];
}

/**
 * Record one observation.
 *
 * Upserts on the unique observation index — the same post, window and source
 * observed twice on one day updates in place rather than accumulating noise,
 * while the same observation tomorrow becomes the next point in the series.
 * That is what makes "first 24 hours" and "growth over time" both answerable
 * from one table.
 *
 * Returns the snapshot id, or `null` if the write failed. A caller that gets
 * `null` must not report a successful sync.
 */
export async function recordSnapshot(
  client: SupabaseClient,
  input: RecordSnapshotInput,
): Promise<string | null> {
  const { data, error } = await client
    .from("analytics_snapshots")
    .upsert(
      {
        owner_id: input.ownerId,
        platform: input.platform,
        source: input.source,
        external_post_id: input.externalPostId,
        social_account_id: input.socialAccountId ?? null,
        scheduled_post_id: input.scheduledPostId ?? null,
        platform_variant_id: input.platformVariantId ?? null,
        content_item_id: input.contentItemId ?? null,
        observation_window: input.window,
        period_start: input.periodStart
          ? input.periodStart.toISOString().slice(0, 10)
          : null,
        period_end: input.periodEnd
          ? input.periodEnd.toISOString().slice(0, 10)
          : null,
        observed_at: input.observedAt.toISOString(),
        fetched_at: input.fetchedAt.toISOString(),
      },
      {
        // Must name every column of the unique observation index, including
        // the generated UTC-day column — a target that names fewer is refused
        // by Postgres outright (42P10), not treated as a broader match.
        onConflict:
          "owner_id,platform,external_post_id,source,observation_window,observed_on_utc",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (error || !data) {
    return null;
  }

  const snapshotId = (data as { id: string }).id;

  if (input.metrics.length === 0) {
    // A snapshot with no metrics is a real answer: the platform was asked and
    // reported nothing measurable. It is kept, because "asked and got nothing"
    // and "never asked" are different, and only one of them should prompt a
    // retry.
    return snapshotId;
  }

  const { error: metricError } = await client.from("analytics_metrics").upsert(
    input.metrics.map((metric) => ({
      owner_id: input.ownerId,
      snapshot_id: snapshotId,
      metric_name: metric.name,
      raw_metric_name: metric.rawName,
      metric_value: metric.value,
      metric_unit: metric.unit,
    })),
    { onConflict: "snapshot_id,metric_name" },
  );

  return metricError ? null : snapshotId;
}

export async function startSyncRun(
  client: SupabaseClient,
  input: {
    ownerId: string;
    platform: VariantPlatform;
    triggerSource: "scheduled" | "manual";
  },
): Promise<string | null> {
  const { data, error } = await client
    .from("analytics_sync_runs")
    .insert({
      owner_id: input.ownerId,
      platform: input.platform,
      trigger_source: input.triggerSource,
      status: "running",
    })
    .select("id")
    .single();

  return error || !data ? null : (data as { id: string }).id;
}

export async function finishSyncRun(
  client: SupabaseClient,
  runId: string,
  input: {
    status: "succeeded" | "partial" | "failed";
    snapshotsWritten: number;
    postsConsidered: number;
    errorCategory?: string | null;
    errorDetail?: string | null;
  },
): Promise<void> {
  await client
    .from("analytics_sync_runs")
    .update({
      status: input.status,
      snapshots_written: input.snapshotsWritten,
      posts_considered: input.postsConsidered,
      error_category: input.errorCategory ?? null,
      error_detail: input.errorDetail ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/**
 * Mark a post as no longer reachable at the platform.
 *
 * **Never touches `status`, `external_post_id` or `posted_at`.** The post was
 * published; that is a historical fact and a third party deleting it later
 * does not unmake it. Only current reachability changes, and every snapshot
 * ever observed is kept.
 */
export async function markExternalAvailability(
  client: SupabaseClient,
  scheduledPostId: string,
  availability: "available" | "unavailable" | "unknown",
): Promise<void> {
  await client
    .from("scheduled_posts")
    .update({
      external_availability: availability,
      external_checked_at: new Date().toISOString(),
    })
    .eq("id", scheduledPostId);
}

/** Posts that have genuinely been published, and can therefore be measured. */
export async function loadMeasurablePosts(
  client: SupabaseClient,
  ownerId: string,
  platform: VariantPlatform,
): Promise<
  {
    scheduledPostId: string;
    platformVariantId: string;
    contentItemId: string | null;
    externalPostId: string;
    postedAt: string | null;
  }[]
> {
  const { data } = await client
    .from("scheduled_posts")
    .select("id, platform_variant_id, external_post_id, posted_at")
    .eq("owner_id", ownerId)
    .eq("status", "posted")
    .not("external_post_id", "is", null);

  const rows = (data ?? []) as {
    id: string;
    platform_variant_id: string;
    external_post_id: string;
    posted_at: string | null;
  }[];

  if (rows.length === 0) {
    return [];
  }

  // The platform lives on the variant, so the rows are filtered through it
  // rather than assumed from the schedule.
  const { data: variants } = await client
    .from("platform_variants")
    .select("id, platform, content_item_id")
    .eq("owner_id", ownerId)
    .in(
      "id",
      rows.map((row) => row.platform_variant_id),
    );

  const variantById = new Map(
    (
      (variants ?? []) as {
        id: string;
        platform: VariantPlatform;
        content_item_id: string;
      }[]
    ).map((variant) => [variant.id, variant]),
  );

  return rows
    .filter(
      (row) => variantById.get(row.platform_variant_id)?.platform === platform,
    )
    .map((row) => ({
      scheduledPostId: row.id,
      platformVariantId: row.platform_variant_id,
      contentItemId:
        variantById.get(row.platform_variant_id)?.content_item_id ?? null,
      externalPostId: row.external_post_id,
      postedAt: row.posted_at,
    }));
}
