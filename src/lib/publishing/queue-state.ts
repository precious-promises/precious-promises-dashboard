import type { ScheduledPost } from "@/lib/schedule/types";

import type { AttemptStatus } from "./types";

/**
 * What a queue row is actually doing, in words the owner can act on.
 *
 * The database status alone is not enough to say this honestly. `posted` means
 * YouTube accepted the bytes and returned an id — it does **not** mean the
 * video is watchable, because YouTube processes afterwards and processing can
 * fail. Showing both as "Posted" would assert something nobody has verified.
 *
 * Equally, a row that cannot go anywhere because no account is connected is not
 * "Scheduled". It is waiting on something the owner has to do.
 *
 * A pure function, so every combination can be tested without a database.
 */

export const QUEUE_STATES = [
  "not_connected",
  "ready",
  "uploading",
  "uploaded_processing",
  "posted",
  "in_platform_drafts",
  "awaiting_manual_post",
  "failed",
  "blocked",
  "stood_down",
] as const;

export type QueueState = (typeof QUEUE_STATES)[number];

export const QUEUE_STATE_LABELS: Record<QueueState, string> = {
  not_connected: "Not connected",
  ready: "Ready",
  uploading: "Uploading",
  uploaded_processing: "Uploaded, processing",
  posted: "Posted",
  in_platform_drafts: "In drafts — not posted",
  awaiting_manual_post: "Post it by hand",
  failed: "Failed",
  blocked: "Blocked",
  stood_down: "Stood down",
};

export const QUEUE_STATE_DETAIL: Record<QueueState, string> = {
  not_connected:
    "No account is connected for this platform, so nothing can be sent.",
  ready: "Waiting for its time. The dispatcher will claim it when due.",
  uploading: "A provider call is in flight.",
  uploaded_processing:
    "The platform accepted the upload and is still processing it. Uploaded is not the same as visible.",
  posted: "Confirmed by the platform, with its own post id.",
  // Stage 9. Both of these look finished and are not — which is exactly why
  // they are their own states rather than shades of "Posted".
  in_platform_drafts:
    "The video reached the platform's drafts. Nobody has seen it: open the platform's own app, review it and publish it there.",
  awaiting_manual_post:
    "The caption, settings and media are ready. Nothing was sent to the platform, and nothing will be until you post it yourself.",
  failed: "Stopped, with the reason recorded.",
  blocked: "Refused before anything was sent. Nothing reached a platform.",
  stood_down: "Paused or cancelled by you.",
};

/** Queue states where something has been done but nothing has been published. */
export const UNPUBLISHED_QUEUE_STATES: readonly QueueState[] = [
  "in_platform_drafts",
  "awaiting_manual_post",
];

export interface QueueStateInput {
  post: ScheduledPost;
  /** The most recent attempt's status, if there is one. */
  latestAttemptStatus: AttemptStatus | null;
  /** Whether an account for this row's platform is connected right now. */
  platformConnected: boolean;
}

/**
 * Derive the display state.
 *
 * Order matters. A terminal outcome wins over a connection problem, because a
 * post that already went out is not waiting on anything — and a cancelled post
 * is reported as cancelled rather than as some downstream problem the owner
 * would try to fix.
 */
export function deriveQueueState(input: QueueStateInput): QueueState {
  const { post } = input;

  if (post.status === "posted") {
    // The distinction the platform itself draws. `processed` — or no
    // processing information at all — is as confirmed as this system gets.
    return post.external_processing_status === "uploaded" ||
      post.external_processing_status === "processing"
      ? "uploaded_processing"
      : "posted";
  }

  // Checked before the connection test, and before anything else the owner
  // might try to fix: the work is done, and what remains is theirs to finish in
  // the platform's own app.
  if (post.status === "uploaded_to_platform_draft") {
    return "in_platform_drafts";
  }

  if (post.status === "ready_for_manual_post") {
    return "awaiting_manual_post";
  }

  if (post.status === "cancelled" || post.status === "paused") {
    return "stood_down";
  }

  if (post.status === "failed") {
    return "failed";
  }

  if (post.status === "publishing") {
    return "uploading";
  }

  // A refusal is recorded on the attempt, not on the schedule — the row goes
  // back to `scheduled` so it stays the owner's. Reading the attempt is what
  // makes the refusal visible.
  if (input.latestAttemptStatus === "blocked") {
    return "blocked";
  }

  if (!input.platformConnected) {
    return "not_connected";
  }

  return "ready";
}
