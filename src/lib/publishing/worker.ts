import type { SupabaseClient } from "@supabase/supabase-js";

import { approvalFingerprint } from "@/lib/approvals/fingerprint";
import { approvalSubjectFrom } from "@/lib/approvals/subject";
import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import { createWorkerClient } from "@/lib/supabase/worker";
import type { PlatformVariant } from "@/lib/variants/types";

import { holdsClaim, newClaimToken, releaseClaim } from "./claim";
import { classifyThrown, safeError, type SafeError } from "./errors";
import { evaluatePublishGate } from "./gate";
import { failedUpdate, postedUpdate } from "./lifecycle";
import { idempotencyKeyFor } from "./idempotency";
import { getPublishingProvider, type PublishResult } from "./providers";
import {
  CLAIM_BATCH_SIZE,
  CLAIM_LEASE_SECONDS,
  nextAttemptNumber,
} from "./types";

/**
 * The publishing worker.
 *
 * Runs outside any HTTP request — a publish depends on a third-party API that
 * may be slow, rate limited or down, and holding a request open for it would
 * be a request that eventually times out with the post in an unknown state.
 *
 * **Stage 6 cannot publish.** `getPublishingProvider` returns `null` for every
 * platform, so every run ends in a recorded refusal. That refusal is the
 * honest outcome, and recording it is the point: the attempt history is how
 * the system stays trustworthy about what did and did not reach an audience.
 *
 * The shape of a run:
 *
 * 1. Claim due posts atomically (`for update skip locked`, with a lease).
 * 2. For each claimed post, **reload everything** and run the safety gate.
 * 3. Record an attempt, then ask the provider — if one exists.
 * 4. Write the outcome. `posted` is only ever written from a real post id.
 */

export interface WorkerRunResult {
  configured: boolean;
  claimed: number;
  blocked: number;
  failed: number;
  posted: number;
  /** Why nothing ran, when nothing could. */
  reason: string | null;
}

const WORKER_NAME = "publish-dispatcher";

/**
 * Claim due posts and process each one.
 *
 * `now` is a parameter so a test can drive the clock, and so a dispatcher run
 * uses one consistent instant for every decision inside it.
 */
export async function runPublishDispatcher(
  now: Date = new Date(),
): Promise<WorkerRunResult> {
  const empty: WorkerRunResult = {
    configured: false,
    claimed: 0,
    blocked: 0,
    failed: 0,
    posted: 0,
    reason: null,
  };

  const { client, reason } = createWorkerClient();
  if (client === null) {
    return { ...empty, reason };
  }

  const claimToken = newClaimToken();

  const { data: claimedRows, error } = await client.rpc(
    "claim_due_scheduled_posts",
    {
      p_claim_token: claimToken,
      p_worker: WORKER_NAME,
      p_lease_seconds: CLAIM_LEASE_SECONDS,
      p_limit: CLAIM_BATCH_SIZE,
      p_now: now.toISOString(),
    },
  );

  if (error) {
    return {
      ...empty,
      configured: true,
      reason: "Could not claim due posts.",
    };
  }

  const claimed = (claimedRows ?? []) as ScheduledPost[];
  const result: WorkerRunResult = {
    ...empty,
    configured: true,
    claimed: claimed.length,
  };

  for (const post of claimed) {
    const outcome = await publishClaimedPost(client, post.id, claimToken, now);

    if (outcome === "posted") {
      result.posted += 1;
    } else if (outcome === "failed") {
      result.failed += 1;
    } else {
      result.blocked += 1;
    }
  }

  return result;
}

export type PublishOutcome = "posted" | "failed" | "blocked";

/**
 * Publish one claimed post.
 *
 * **Everything is reloaded here.** Nothing from the claim, and nothing from
 * whatever payload enqueued this job, is trusted: the gap between claiming and
 * sending is exactly where a cancellation or an edit lands.
 */
export async function publishClaimedPost(
  client: SupabaseClient,
  scheduledPostId: string,
  claimToken: string,
  now: Date = new Date(),
): Promise<PublishOutcome> {
  // 1. Reload the schedule.
  const { data: postRow } = await client
    .from("scheduled_posts")
    .select("*")
    .eq("id", scheduledPostId)
    .maybeSingle();

  const post = (postRow as ScheduledPost | null) ?? null;

  if (post === null) {
    return "blocked";
  }

  // The worker bypasses RLS, so ownership is filtered explicitly from here on.
  const owner = post.owner_id;

  // 2. Reload the variant, item, media and video — the same inputs the
  //    approval fingerprint was taken over.
  const { data: variantRow } = await client
    .from("platform_variants")
    .select("*")
    .eq("id", post.platform_variant_id)
    .eq("owner_id", owner)
    .maybeSingle();

  const variant = (variantRow as PlatformVariant | null) ?? null;

  const { data: itemRow } = variant
    ? await client
        .from("content_items")
        .select("*")
        .eq("id", variant.content_item_id)
        .eq("owner_id", owner)
        .maybeSingle()
    : { data: null };

  const item = (itemRow as ContentItem | null) ?? null;

  const [videoResult, mediaResult, attemptsResult] = await Promise.all([
    item
      ? client
          .from("video_projects")
          .select("id, current_revision, status")
          .eq("content_item_id", item.id)
          .eq("owner_id", owner)
      : Promise.resolve({ data: [] }),
    item
      ? client
          .from("content_media")
          .select("media_asset_id, purpose, sort_order")
          .eq("content_item_id", item.id)
      : Promise.resolve({ data: [] }),
    client
      .from("publish_attempts")
      .select("attempt_number, status, idempotency_key")
      .eq("scheduled_post_id", post.id)
      .eq("owner_id", owner)
      .order("attempt_number", { ascending: false }),
  ]);

  const video =
    (
      (videoResult.data ?? []) as {
        id: string;
        current_revision: number;
        status: string;
      }[]
    ).find((row) => row.status !== "archived") ?? null;

  const { data: sceneRows } = video
    ? await client.from("video_scenes").select("id").eq("project_id", video.id)
    : { data: [] };

  const mediaSelections = (
    (mediaResult.data ?? []) as {
      media_asset_id: string;
      purpose: string;
      sort_order: number;
    }[]
  ).map((row) => ({
    mediaAssetId: row.media_asset_id,
    purpose: row.purpose,
    sortOrder: row.sort_order,
  }));

  // 3. Recompute the fingerprint from what is stored right now.
  const currentFingerprint =
    variant && item
      ? approvalFingerprint(
          approvalSubjectFrom(
            variant,
            item,
            video
              ? { id: video.id, current_revision: video.current_revision }
              : null,
            mediaSelections,
          ),
        )
      : null;

  const attempts = (attemptsResult.data ?? []) as {
    attempt_number: number;
    status: string;
    idempotency_key: string;
  }[];

  const provider = getPublishingProvider(post_platform(variant));
  const providerAvailable = provider !== null && (await provider.isConnected());

  // 4. The gate. Everything above was loaded for this.
  const gate = evaluatePublishGate({
    post,
    variant,
    item,
    currentFingerprint,
    hasVideo: video !== null && ((sceneRows ?? []).length ?? 0) > 0,
    mediaCount: mediaSelections.length,
    successfulAttemptExists: attempts.some(
      (attempt) => attempt.status === "succeeded",
    ),
    claimToken,
    providerAvailable,
    now,
  });

  const idempotencyKey =
    variant && variant.approval_hash
      ? idempotencyKeyFor({
          scheduledPostId: post.id,
          platform: variant.platform,
          approvalHash: variant.approval_hash,
        })
      : `pp_publish_unresolved_${post.id}`;

  const attemptNumber = nextAttemptNumber(attempts[0]?.attempt_number ?? null);

  if (!gate.allowed) {
    await recordAttempt(client, {
      post,
      variant,
      attemptNumber,
      idempotencyKey,
      status: "blocked",
      error: gate.error,
      now,
    });

    await applyBlock(client, post, gate.error, now);
    return "blocked";
  }

  // 5. Only now does anything leave this system — and in Stage 6 it cannot,
  //    because the gate above already refused on provider_not_connected.
  await recordAttempt(client, {
    post,
    variant,
    attemptNumber,
    idempotencyKey,
    status: "started",
    error: null,
    now,
  });

  await client
    .from("scheduled_posts")
    .update({
      status: "publishing",
      publishing_started_at: now.toISOString(),
      attempt_count: attemptNumber,
    })
    .eq("id", post.id)
    .eq("owner_id", owner)
    .eq("claim_token", claimToken);

  let outcome: PublishResult;
  try {
    outcome = await provider!.publish({
      scheduledPost: post,
      variant: variant!,
      item: item!,
      idempotencyKey,
    });
  } catch (thrown) {
    outcome = { outcome: "failed", error: classifyThrown(thrown) };
  }

  // 6. Re-verify the claim before writing an outcome: the lease may have
  //    lapsed while the provider was working, and another worker may now own
  //    this post.
  const { data: freshRow } = await client
    .from("scheduled_posts")
    .select("*")
    .eq("id", post.id)
    .maybeSingle();

  const fresh = (freshRow as ScheduledPost | null) ?? null;
  if (fresh === null || !holdsClaim(fresh, claimToken, new Date())) {
    return "blocked";
  }

  if (outcome.outcome === "succeeded") {
    const update = postedUpdate(
      outcome.externalPostId,
      outcome.externalPostUrl,
      now,
    );

    // `postedUpdate` returns null without a real id, so a provider that
    // reported success with nothing to show for it fails instead.
    if (update === null) {
      await applyFailure(
        client,
        post,
        safeError("unknown", "The platform reported success with no post id."),
        attemptNumber,
        idempotencyKey,
        variant,
        now,
      );
      return "failed";
    }

    await client
      .from("scheduled_posts")
      .update({ ...update, ...releaseClaim() })
      .eq("id", post.id)
      .eq("owner_id", owner);

    await client
      .from("publish_attempts")
      .update({
        status: "succeeded",
        external_post_id: outcome.externalPostId,
        external_post_url: outcome.externalPostUrl,
        completed_at: now.toISOString(),
      })
      .eq("scheduled_post_id", post.id)
      .eq("attempt_number", attemptNumber);

    return "posted";
  }

  if (outcome.outcome === "incomplete") {
    await client
      .from("scheduled_posts")
      .update({ status: outcome.state, ...releaseClaim() })
      .eq("id", post.id)
      .eq("owner_id", owner);
    return "blocked";
  }

  await applyFailure(
    client,
    post,
    outcome.error,
    attemptNumber,
    idempotencyKey,
    variant,
    now,
  );
  return "failed";
}

/** The platform of a variant, or a safe default when there is no variant. */
function post_platform(variant: PlatformVariant | null) {
  return variant?.platform ?? "youtube";
}

async function recordAttempt(
  client: SupabaseClient,
  input: {
    post: ScheduledPost;
    variant: PlatformVariant | null;
    attemptNumber: number;
    idempotencyKey: string;
    status: "started" | "blocked" | "failed";
    error: SafeError | null;
    now: Date;
  },
): Promise<void> {
  await client.from("publish_attempts").insert({
    owner_id: input.post.owner_id,
    scheduled_post_id: input.post.id,
    platform_variant_id: input.post.platform_variant_id,
    platform: post_platform(input.variant),
    attempt_number: input.attemptNumber,
    idempotency_key: input.idempotencyKey,
    status: input.status,
    // Always 'none' in Stage 6: no adapter is registered, and the database
    // refuses a succeeded attempt from this provider.
    provider: "none",
    retryable: input.error?.retryable ?? null,
    safe_error_code: input.error?.code ?? null,
    safe_error_message: input.error?.message ?? null,
    started_at: input.now.toISOString(),
    completed_at: input.status === "started" ? null : input.now.toISOString(),
  });
}

/**
 * Write the outcome of a refusal.
 *
 * A block is not a failure of the post: the reason is usually something the
 * owner can put right. `schedule_cancelled` and `schedule_paused` leave the
 * status alone — the record already says what happened — and everything else
 * returns the post to `scheduled` with the claim released, so it is the
 * owner's again.
 */
async function applyBlock(
  client: SupabaseClient,
  post: ScheduledPost,
  error: SafeError,
  now: Date,
): Promise<void> {
  if (error.code === "schedule_cancelled" || error.code === "schedule_paused") {
    await client
      .from("scheduled_posts")
      .update(releaseClaim())
      .eq("id", post.id)
      .eq("owner_id", post.owner_id);
    return;
  }

  await client
    .from("scheduled_posts")
    .update({
      status: "scheduled",
      last_error_code: error.code,
      last_error_message: error.message,
      ...releaseClaim(),
    })
    .eq("id", post.id)
    .eq("owner_id", post.owner_id);

  void now;
}

async function applyFailure(
  client: SupabaseClient,
  post: ScheduledPost,
  error: SafeError,
  attemptNumber: number,
  idempotencyKey: string,
  variant: PlatformVariant | null,
  now: Date,
): Promise<void> {
  await client
    .from("scheduled_posts")
    .update(failedUpdate(error.code, error.message))
    .eq("id", post.id)
    .eq("owner_id", post.owner_id);

  await client
    .from("publish_attempts")
    .update({
      status: "failed",
      retryable: error.retryable,
      safe_error_code: error.code,
      safe_error_message: error.message,
      completed_at: now.toISOString(),
    })
    .eq("scheduled_post_id", post.id)
    .eq("attempt_number", attemptNumber);

  void idempotencyKey;
  void variant;
}
