import { schedules, task } from "@trigger.dev/sdk";

import { syncAllAnalytics, syncPlatformAnalytics } from "@/lib/analytics/sync";
import { createWorkerClient } from "@/lib/supabase/worker";
import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Background analytics synchronisation.
 *
 * **Implemented, not connected, not running.** The task code is written and
 * type-checked; connecting it to Trigger.dev Cloud needs an interactive login
 * and a project, which is a documented manual step. Until that happens these
 * definitions are inert — and the interface says "not running" rather than
 * implying a schedule that does not exist.
 *
 * A manual refresh from the dashboard deliberately does **not** go through
 * Trigger.dev. It calls the same orchestration layer directly from a Server
 * Action, so Dave can fetch figures today without any of this being deployed.
 *
 * ## What this must never do
 *
 * Touch a publish record. Analytics run downstream of publishing and fail for
 * entirely different reasons — a platform that cannot find a two-year-old
 * video is describing its own retention policy, not unmaking a publication.
 * The orchestration layer enforces that; this file only schedules it.
 *
 * ## TikTok is absent
 *
 * Not an oversight. TikTok exposes no analytics through any API this product
 * can legitimately use, so there is nothing to schedule — see
 * `PLATFORM_ANALYTICS_CAPABILITIES`.
 */

/** Platforms with a real adapter. TikTok is deliberately not among them. */
const SYNCED_PLATFORMS: readonly VariantPlatform[] = ["youtube", "instagram"];

/**
 * Every owner with a connected account worth syncing.
 *
 * Read inside the run rather than passed in a payload: a payload describes the
 * world as it was when the job was enqueued, and connections come and go.
 */
async function ownersToSync(): Promise<string[]> {
  const { client } = createWorkerClient();
  if (client === null) {
    return [];
  }

  const { data } = await client
    .from("social_accounts")
    .select("owner_id, platform")
    .eq("status", "connected")
    .in("platform", [...SYNCED_PLATFORMS]);

  const owners = new Set<string>();
  for (const row of (data ?? []) as { owner_id: string }[]) {
    owners.add(row.owner_id);
  }

  return [...owners];
}

/**
 * The daily refresh.
 *
 * Once a day, early morning UK time. Deliberately conservative: neither
 * platform documents a figure that changes fast enough to justify more, and
 * both publish rate limits that a tighter schedule would spend for no gain.
 *
 * The orchestration layer decides which observation windows are actually due
 * for each post — a two-day-old post has closed its first-24-hours window and
 * not its first-7-days one — so this schedule does not need to know anything
 * about individual posts.
 */
export const analyticsDailySync = schedules.task({
  id: "analytics-daily-sync",
  // 05:15 UTC. Off the hour so it does not contend with every other
  // cron-driven job in the world.
  cron: "15 5 * * *",
  queue: { concurrencyLimit: 1 },
  maxDuration: 600,
  run: async () => {
    const owners = await ownersToSync();
    const results = [];

    for (const ownerId of owners) {
      results.push(
        ...(await syncAllAnalytics({ ownerId, triggerSource: "scheduled" })),
      );
    }

    // Counts only. No metric values, no tokens, no provider payloads — a run's
    // output is a record of what happened, not a second copy of the data.
    return {
      owners: owners.length,
      platforms: results.map((result) => ({
        platform: result.platform,
        ok: result.ok,
        snapshotsWritten: result.snapshotsWritten,
        postsConsidered: result.postsConsidered,
        errorCategory: result.errorCategory,
      })),
    };
  },
});

export interface AnalyticsSyncPayload {
  ownerId: string;
  platform: VariantPlatform;
}

/**
 * Sync one owner and platform on demand.
 *
 * Exists so a newly published post can be picked up sooner than the next daily
 * run without sweeping everything. Takes the platform explicitly because a
 * failure on one must never stop another.
 */
export const analyticsSyncOne = task({
  id: "analytics-sync-one",
  maxDuration: 300,
  run: async (payload: AnalyticsSyncPayload) => {
    const result = await syncPlatformAnalytics({
      ownerId: payload.ownerId,
      platform: payload.platform,
      triggerSource: "scheduled",
    });

    return {
      platform: result.platform,
      ok: result.ok,
      snapshotsWritten: result.snapshotsWritten,
      postsConsidered: result.postsConsidered,
      errorCategory: result.errorCategory,
      retryable: result.retryable,
    };
  },
});

/**
 * Whether a Trigger.dev project is genuinely configured.
 *
 * Read by the interface so it can say "implemented, not running" rather than
 * implying a schedule that does not exist. The fallback in `trigger.config.ts`
 * is the tell: an unset project reference means nothing is deployed.
 */
export function analyticsSchedulingConnected(): boolean {
  const ref = process.env.TRIGGER_PROJECT_REF;
  return typeof ref === "string" && ref !== "" && ref !== "proj_not_configured";
}
