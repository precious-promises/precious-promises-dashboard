import { getLiveCredential } from "@/lib/accounts/credentials";
import type { SocialAccount } from "@/lib/accounts/types";
import { recordAuditAsWorker } from "@/lib/audit/repository";
import { createWorkerClient } from "@/lib/supabase/worker";
import type { VariantPlatform } from "@/lib/variants/types";

import {
  analyticsCapabilityFor,
  getAnalyticsProvider,
  isRetryableAnalyticsError,
  POST_GONE_ERRORS,
  type AnalyticsErrorCategory,
} from "./providers";
import {
  finishSyncRun,
  loadMeasurablePosts,
  markExternalAvailability,
  recordSnapshot,
  startSyncRun,
} from "./repository";
import { hasAnalyticsScopes } from "./readiness";
import {
  METRIC_UNIT_BY_NAME,
  OBSERVATION_WINDOW_DAYS,
  type MetricName,
  type ObservationWindow,
} from "./types";

// Registering the adapters is a side effect of importing them, so the registry
// is populated wherever this module is used.
import "./youtube-provider";
import "./instagram-provider";

/**
 * Fetching analytics.
 *
 * ## What this must never do
 *
 * **Touch a publish record.** Analytics answer a different question from
 * publishing, fail for different reasons, and are strictly downstream. A
 * platform that cannot find a two-year-old video is describing its own
 * retention policy, not unmaking a publication — so a failure here writes a
 * sync-run row, may mark external availability, and stops.
 *
 * ## What it must never write
 *
 * A zero it was not given. A provider that omits a metric produces a snapshot
 * without that metric, and the interface renders the absence honestly. There
 * is no `?? 0` anywhere in this file, and that is the point.
 */

export interface SyncResult {
  platform: VariantPlatform;
  ok: boolean;
  snapshotsWritten: number;
  postsConsidered: number;
  errorCategory: AnalyticsErrorCategory | null;
  detail: string | null;
  retryable: boolean;
}

/**
 * Which windows a post is due for.
 *
 * A post two days old has finished its first-24-hours window and has not
 * reached its first-7-days one, so only the closed windows plus the always-open
 * lifetime reading are worth asking about. Fetching a window that has not
 * closed would record a partial figure under a name that claims completeness.
 */
export function windowsDueFor(
  postedAt: string | null,
  now: Date = new Date(),
): ObservationWindow[] {
  if (postedAt === null) {
    return [];
  }

  const published = Date.parse(postedAt);
  if (Number.isNaN(published)) {
    return [];
  }

  const ageDays = (now.getTime() - published) / 86_400_000;
  // Lifetime is always current, so it is always worth refreshing.
  const windows: ObservationWindow[] = ["lifetime"];

  for (const [window, days] of Object.entries(OBSERVATION_WINDOW_DAYS)) {
    if (days !== null && ageDays >= days) {
      windows.push(window as ObservationWindow);
    }
  }

  return windows;
}

/** The date range a window covers for a given post. */
export function windowRange(
  postedAt: string,
  window: ObservationWindow,
): { start: Date; end: Date } | null {
  const published = new Date(postedAt);
  if (Number.isNaN(published.getTime())) {
    return null;
  }

  const days = OBSERVATION_WINDOW_DAYS[window];
  if (days === null) {
    // Lifetime: from publication to now.
    return { start: published, end: new Date() };
  }

  return {
    start: published,
    end: new Date(published.getTime() + days * 86_400_000),
  };
}

/**
 * Sync one platform for one owner.
 *
 * Returns a result rather than throwing, so a failure on one platform never
 * stops another — and never propagates anywhere near the publishing worker.
 */
export async function syncPlatformAnalytics(input: {
  ownerId: string;
  platform: VariantPlatform;
  triggerSource: "scheduled" | "manual";
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<SyncResult> {
  const now = input.now ?? new Date();
  const platform = input.platform;

  const base: SyncResult = {
    platform,
    ok: false,
    snapshotsWritten: 0,
    postsConsidered: 0,
    errorCategory: null,
    detail: null,
    retryable: false,
  };

  const capability = analyticsCapabilityFor(platform);
  if (!capability.implemented) {
    return {
      ...base,
      errorCategory: "unsupported_metric",
      detail: capability.detail,
    };
  }

  const provider = getAnalyticsProvider(platform);
  if (provider === null) {
    return {
      ...base,
      errorCategory: "unsupported_metric",
      detail: "No analytics adapter is registered for this platform.",
    };
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return {
      ...base,
      errorCategory: "unknown",
      detail: "No trusted worker credential is configured.",
    };
  }

  const { data } = await client
    .from("social_accounts")
    .select("*")
    .eq("owner_id", input.ownerId)
    .eq("platform", platform)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  const account = (data as SocialAccount | null) ?? null;

  if (account === null) {
    return {
      ...base,
      errorCategory: "account_disconnected",
      detail: "No connected account for this platform.",
    };
  }

  // Connected is not measurable. Checked before anything is fetched, and
  // recorded so the interface can prompt for the missing consent.
  if (!hasAnalyticsScopes(platform, account.granted_scopes)) {
    await recordAuditAsWorker(
      client,
      input.ownerId,
      "analytics_permission_required",
      "social_account",
      account.id,
      { platform },
    );

    return {
      ...base,
      errorCategory: "permission_missing",
      detail:
        "The connection does not carry the analytics permission. Reconnect and grant it.",
    };
  }

  const posts = await loadMeasurablePosts(client, input.ownerId, platform);
  const runId = await startSyncRun(client, {
    ownerId: input.ownerId,
    platform,
    triggerSource: input.triggerSource,
  });

  await recordAuditAsWorker(
    client,
    input.ownerId,
    "analytics_sync_started",
    "social_account",
    account.id,
    { platform, posts_considered: posts.length },
  );

  if (posts.length === 0) {
    if (runId) {
      await finishSyncRun(client, runId, {
        status: "succeeded",
        snapshotsWritten: 0,
        postsConsidered: 0,
      });
    }
    // Nothing published is not a failure and not a zero. It is an empty set.
    return { ...base, ok: true };
  }

  const credential = await getLiveCredential(client, account);
  if (!credential.ok) {
    if (runId) {
      await finishSyncRun(client, runId, {
        status: "failed",
        snapshotsWritten: 0,
        postsConsidered: posts.length,
        errorCategory: "token_expired",
        errorDetail: credential.reason,
      });
    }
    return {
      ...base,
      postsConsidered: posts.length,
      errorCategory: "token_expired",
      detail: credential.reason,
    };
  }

  const byId = new Map(posts.map((post) => [post.externalPostId, post]));
  let written = 0;
  let lastError: AnalyticsErrorCategory | null = null;
  let lastDetail: string | null = null;
  // Fetched but not stored is a failure too. Left uncounted, a database
  // refusal would let a run report "succeeded, 0 written" — stale data
  // dressed as fresh, which is the one lie this stage exists to prevent.
  let writeFailures = 0;

  // Group by window so each fetch asks one coherent question.
  const windows = new Map<ObservationWindow, typeof posts>();
  for (const post of posts) {
    for (const window of windowsDueFor(post.postedAt, now)) {
      const list = windows.get(window) ?? [];
      list.push(post);
      windows.set(window, list);
    }
  }

  for (const [window, windowPosts] of windows) {
    const result = await provider.fetch({
      ownerId: input.ownerId,
      accessToken: credential.credential.accessToken,
      externalPostIds: windowPosts.map((post) => post.externalPostId),
      window,
      periodStart: null,
      periodEnd: null,
      fetchImpl: input.fetchImpl,
    });

    if (!result.ok) {
      lastError = result.category;
      lastDetail = result.detail;

      // A post the platform can no longer find is marked unavailable — and
      // nothing else about it changes. It was published; that stands.
      if (POST_GONE_ERRORS.includes(result.category)) {
        for (const post of windowPosts) {
          await markExternalAvailability(
            client,
            post.scheduledPostId,
            "unavailable",
          );
        }
      }
      continue;
    }

    // A provider may read most of a batch and lose individual posts — Meta
    // answers per media. Those partial failures surface here so the run is
    // recorded as partial, and a post the platform says is gone is marked
    // unreachable exactly as a whole-batch refusal would mark it.
    for (const failure of result.failures ?? []) {
      lastError = failure.category;
      lastDetail = `Some posts could not be read (${failure.category}). Figures for the rest were fetched.`;

      if (POST_GONE_ERRORS.includes(failure.category)) {
        const post = byId.get(failure.externalPostId);
        if (post !== undefined) {
          await markExternalAvailability(
            client,
            post.scheduledPostId,
            "unavailable",
          );
        }
      }
    }

    for (const fetched of result.metrics) {
      const post = byId.get(fetched.externalPostId);
      if (post === undefined) {
        continue;
      }

      const range = post.postedAt
        ? windowRange(post.postedAt, fetched.window)
        : null;

      const metrics = Object.entries(fetched.values).map(([name, entry]) => ({
        name: name as MetricName,
        rawName: entry.rawName,
        value: entry.value,
        unit: METRIC_UNIT_BY_NAME[name as MetricName],
      }));

      const snapshotId = await recordSnapshot(client, {
        ownerId: input.ownerId,
        platform,
        source: provider.source,
        externalPostId: fetched.externalPostId,
        socialAccountId: account.id,
        scheduledPostId: post.scheduledPostId,
        platformVariantId: post.platformVariantId,
        contentItemId: post.contentItemId,
        window: fetched.window,
        periodStart: range?.start ?? null,
        periodEnd: range?.end ?? null,
        observedAt: fetched.observedAt,
        fetchedAt: now,
        metrics,
      });

      if (snapshotId !== null) {
        written += 1;
        await markExternalAvailability(
          client,
          post.scheduledPostId,
          "available",
        );
      } else {
        writeFailures += 1;
      }
    }
  }

  if (writeFailures > 0) {
    lastError = "unknown";
    lastDetail = `${writeFailures} fetched ${writeFailures === 1 ? "observation" : "observations"} could not be stored. The run is reported as incomplete rather than pretending otherwise.`;
  }

  const status =
    lastError === null ? "succeeded" : written > 0 ? "partial" : "failed";

  if (runId) {
    await finishSyncRun(client, runId, {
      status,
      snapshotsWritten: written,
      postsConsidered: posts.length,
      errorCategory: lastError,
      errorDetail: lastDetail,
    });
  }

  await recordAuditAsWorker(
    client,
    input.ownerId,
    lastError === null ? "analytics_sync_completed" : "analytics_sync_failed",
    "social_account",
    account.id,
    // Counts only. No metric values, no tokens, no provider payloads — the
    // audit log is not a second and diverging copy of the data.
    { platform, snapshots_written: written, posts_considered: posts.length },
  );

  return {
    platform,
    ok: status !== "failed",
    snapshotsWritten: written,
    postsConsidered: posts.length,
    errorCategory: lastError,
    detail: lastDetail,
    retryable: lastError !== null && isRetryableAnalyticsError(lastError),
  };
}

/** Sync every platform that has an adapter. Failures stay isolated. */
export async function syncAllAnalytics(input: {
  ownerId: string;
  triggerSource: "scheduled" | "manual";
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<SyncResult[]> {
  const platforms: VariantPlatform[] = ["youtube", "instagram", "tiktok"];
  const results: SyncResult[] = [];

  for (const platform of platforms) {
    results.push(
      await syncPlatformAnalytics({
        ownerId: input.ownerId,
        platform,
        triggerSource: input.triggerSource,
        now: input.now,
        fetchImpl: input.fetchImpl,
      }),
    );
  }

  return results;
}
