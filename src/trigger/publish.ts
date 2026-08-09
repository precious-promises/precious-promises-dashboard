import { schedules, task } from "@trigger.dev/sdk";

import { createWorkerClient } from "@/lib/supabase/worker";
import {
  publishClaimedPost,
  runPublishDispatcher,
} from "@/lib/publishing/worker";

/**
 * The background publishing tasks.
 *
 * **Nothing here is deployed, and nothing here can publish.** The task code is
 * written and type-checked; connecting it to Trigger.dev Cloud needs an
 * interactive login, which is documented as a single manual step. Until then
 * these definitions are inert.
 *
 * Even once deployed, they cannot post: `getPublishingProvider` returns `null`
 * for every platform, so the safety gate refuses on `provider_not_connected`
 * before anything leaves the system.
 *
 * The division of labour is deliberate. Trigger.dev provides the schedule, the
 * runtime and transport-level retries. **Every decision about whether a post
 * may go out is made in the domain layer**, against records reloaded inside
 * the run — because a job's payload describes the world as it was when the job
 * was enqueued, and that world may have moved.
 */

/**
 * Look for due posts, every five minutes.
 *
 * Frequent enough that a post goes out close to its time, infrequent enough
 * that an idle account costs almost nothing. The dispatcher claims atomically,
 * so overlapping runs cannot both take the same post.
 */
export const publishDispatcher = schedules.task({
  id: "publish-dispatcher",
  cron: "*/5 * * * *",
  // One dispatcher at a time. Claiming is atomic regardless, but a second
  // concurrent sweep would only add contention.
  queue: { concurrencyLimit: 1 },
  run: async () => {
    const result = await runPublishDispatcher(new Date());

    // Returned rather than logged as prose: the run's output is the record of
    // what happened, and it contains no content and no credentials.
    return {
      configured: result.configured,
      claimed: result.claimed,
      blocked: result.blocked,
      failed: result.failed,
      posted: result.posted,
      reason: result.reason,
    };
  },
});

export interface PublishPostPayload {
  scheduledPostId: string;
  claimToken: string;
}

/**
 * Publish one already-claimed post.
 *
 * Split from the dispatcher so a single post can be retried on its own, and so
 * one slow platform cannot hold up the sweep.
 *
 * The payload carries only two identifiers — deliberately. Everything else is
 * reloaded inside the run, because a payload written minutes ago is exactly
 * the stale state the safety gate exists to catch.
 */
export const publishScheduledPost = task({
  id: "publish-scheduled-post",
  // One publish per platform at a time is handled by the claim; this limit
  // keeps a burst of due posts from opening dozens of provider connections.
  queue: { concurrencyLimit: 3 },
  run: async (payload: PublishPostPayload) => {
    const { client, reason } = createWorkerClient();

    if (client === null) {
      // Not an error to retry: no credential means no worker, and trying
      // again in ten seconds will not produce one.
      return { outcome: "blocked" as const, reason };
    }

    const outcome = await publishClaimedPost(
      client,
      payload.scheduledPostId,
      payload.claimToken,
      new Date(),
    );

    return { outcome, reason: null };
  },
});
