import { randomUUID } from "node:crypto";

import type { ScheduledPost } from "@/lib/schedule/types";

import { CLAIM_LEASE_SECONDS } from "./types";

/**
 * Claims and leases.
 *
 * Two workers must never publish the same post. The claim itself is taken
 * atomically in Postgres — `claim_due_scheduled_posts` uses
 * `for update skip locked`, so the row a worker gets is one no other worker
 * can also get.
 *
 * These functions are the *other* half: checking, in the worker, that the
 * claim it took is still the claim on the row. Between claiming and sending,
 * anything could have happened — a cancellation, another worker reclaiming an
 * expired lease — so the token is verified again immediately before the
 * provider call.
 *
 * **Leases expire.** A worker that crashes mid-flight leaves a claim that
 * lapses after `CLAIM_LEASE_SECONDS`, after which the dispatcher can pick the
 * post up again. A lock without an expiry would let one crash brick a post
 * permanently, which is worse than the duplicate it was guarding against.
 */

export type ClaimableFields = Pick<
  ScheduledPost,
  "claim_token" | "claim_expires_at"
>;

export function newClaimToken(): string {
  return randomUUID();
}

export function leaseExpiry(
  now: Date,
  seconds: number = CLAIM_LEASE_SECONDS,
): Date {
  return new Date(now.getTime() + Math.max(seconds, 1) * 1000);
}

/** Whether a claim has lapsed and the post may be claimed again. */
export function isClaimExpired(post: ClaimableFields, now: Date): boolean {
  if (post.claim_expires_at === null) {
    return true;
  }
  return new Date(post.claim_expires_at).getTime() < now.getTime();
}

/**
 * Whether *this* worker still holds the claim.
 *
 * Both halves matter: the token must match **and** the lease must not have
 * lapsed. A worker whose lease expired has to assume another worker has taken
 * over, even if the token still happens to be its own.
 */
export function holdsClaim(
  post: ClaimableFields,
  token: string,
  now: Date,
): boolean {
  if (post.claim_token === null || post.claim_token !== token) {
    return false;
  }
  return !isClaimExpired(post, now);
}

/** The fields that release a claim, so a post returns to the owner. */
export function releaseClaim(): {
  claim_token: null;
  claimed_at: null;
  claim_expires_at: null;
  claimed_by: null;
} {
  return {
    claim_token: null,
    claimed_at: null,
    claim_expires_at: null,
    claimed_by: null,
  };
}
