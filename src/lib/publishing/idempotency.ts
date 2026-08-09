import { createHash } from "node:crypto";

import type { VariantPlatform } from "@/lib/variants/types";

/**
 * The identity of one approved publishing operation.
 *
 * The rule: **the same approved operation must never produce two successful
 * external posts.** That needs an identity that is stable across retries and
 * worker restarts, and different when the thing being published is different.
 *
 * It binds three facts:
 *
 * - the scheduled post — this time, this slot
 * - the platform — the same wording going to two platforms is two operations
 * - the approval fingerprint — **what was approved**
 *
 * Because the fingerprint is in the key, re-approving a materially changed
 * variant yields a *different* operation. That is deliberate: the new wording
 * has never been published, so it must not be deduplicated against the old
 * one. Conversely a retry of the unchanged operation keeps the same key and
 * cannot post twice.
 *
 * **Server-only** — it imports `node:crypto`.
 */

export interface PublishOperation {
  scheduledPostId: string;
  platform: VariantPlatform;
  /** The approval fingerprint the schedule rests on. */
  approvalHash: string;
}

/** The canonical string, exported because a hash is opaque when a test fails. */
export function canonicaliseOperation(operation: PublishOperation): string {
  return [
    `post=${operation.scheduledPostId}`,
    `platform=${operation.platform}`,
    `approval=${operation.approvalHash}`,
  ].join("|");
}

/**
 * The idempotency key: a readable prefix plus a digest.
 *
 * The prefix makes a row legible in the database without decoding anything;
 * the digest is what actually distinguishes operations.
 */
export function idempotencyKeyFor(operation: PublishOperation): string {
  const digest = createHash("sha256")
    .update(canonicaliseOperation(operation), "utf8")
    .digest("hex");

  return `pp_publish_${operation.platform}_${digest}`;
}

/**
 * Whether two operations are the same publishing act.
 *
 * Used to decide whether an existing successful attempt already covers what a
 * worker is about to do.
 */
export function isSameOperation(
  a: PublishOperation,
  b: PublishOperation,
): boolean {
  return canonicaliseOperation(a) === canonicaliseOperation(b);
}
