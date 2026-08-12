import type { ScheduleStatus } from "@/lib/schedule/types";

/**
 * The publishing lifecycle.
 *
 * One transition table for the whole of it, so there is a single place to
 * check what the system can and cannot do to a scheduled post. Nothing writes
 * a status without asking here first — a form certainly cannot.
 *
 * ```
 * scheduled ──▶ queued ──▶ publishing ──▶ posted
 *     │            │            │
 *     │            │            ├──▶ uploaded_to_platform_draft ─┐
 *     │            │            ├──▶ ready_for_manual_post ──────┤
 *     │            └────────────┴──▶ failed                      │
 *     │            │                                             │
 *     └────────────┴──▶ paused ──▶ scheduled ◀───────────────────┘
 *     │            │
 *     └────────────┴──▶ cancelled   (terminal)
 * ```
 *
 * **`posted` is reachable only from `publishing`.** A job nothing ever ran
 * cannot become a finished post, and the database additionally refuses
 * `posted` without the platform's own post id.
 *
 * The two incomplete outcomes are reachable from `publishing` too, and are
 * deliberately **not terminal**: a draft that Dave finishes in the platform's
 * app, or a manual post he makes by hand, may need the row rescheduled or
 * stood down. What they can never do is become `posted` — this system did not
 * publish them and has no platform id proving anybody did.
 */

const TRANSITIONS: Record<ScheduleStatus, readonly ScheduleStatus[]> = {
  scheduled: ["queued", "paused", "cancelled"],
  // A claimed job can still be stood down: the owner may cancel, and an
  // approval may lapse between claiming and sending.
  queued: ["publishing", "failed", "paused", "cancelled"],
  // Once a provider call is in flight, only its outcome may follow. Pausing
  // here would leave a request the system had stopped tracking.
  publishing: [
    "posted",
    "failed",
    "ready_for_manual_post",
    "uploaded_to_platform_draft",
  ],
  // A failed attempt does not end the post: it can be rescheduled by the
  // owner, which returns it to `scheduled`.
  failed: ["scheduled", "cancelled"],
  paused: ["scheduled", "cancelled"],
  posted: [],
  cancelled: [],
  // Note what is absent from both: `posted`. A draft in TikTok's app and a
  // caption prepared for manual posting are things a human still has to
  // finish, and this system holds no platform post id for either. Allowing the
  // transition would let a row claim a publication nobody can point at.
  ready_for_manual_post: ["scheduled", "cancelled"],
  uploaded_to_platform_draft: ["scheduled", "cancelled"],
};

export function canTransitionPublish(
  from: ScheduleStatus,
  to: ScheduleStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses from which nothing further happens. */
export const TERMINAL_STATUSES: readonly ScheduleStatus[] = [
  "posted",
  "cancelled",
];

export function isTerminalStatus(status: ScheduleStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses where the worker owns the record rather than the owner. */
export const IN_FLIGHT_STATUSES: readonly ScheduleStatus[] = [
  "queued",
  "publishing",
];

export function isInFlight(status: ScheduleStatus): boolean {
  return IN_FLIGHT_STATUSES.includes(status);
}

/**
 * Whether a post may be recorded as posted.
 *
 * Requires the platform's own id — the same rule the database enforces, stated
 * here so a caller cannot construct the update at all without one. There is no
 * overload of this that takes no id.
 */
export function canRecordPosted(
  from: ScheduleStatus,
  externalPostId: string | null | undefined,
): boolean {
  if (!canTransitionPublish(from, "posted")) {
    return false;
  }
  return typeof externalPostId === "string" && externalPostId.trim() !== "";
}

/**
 * The update that records a genuine platform success.
 *
 * Returns `null` when there is no external id, so a caller holding nothing
 * from a provider cannot produce a `posted` update by mistake. In Stage 6 no
 * provider returns an id, so this never produces one.
 */
export function postedUpdate(
  externalPostId: string,
  externalPostUrl: string | null,
  at: Date,
): {
  status: "posted";
  external_post_id: string;
  external_post_url: string | null;
  posted_at: string;
  last_error_code: null;
  last_error_message: null;
} | null {
  if (externalPostId.trim() === "") {
    return null;
  }

  return {
    status: "posted",
    external_post_id: externalPostId,
    external_post_url: externalPostUrl,
    posted_at: at.toISOString(),
    last_error_code: null,
    last_error_message: null,
  };
}

/** The update that records a failure, with its sanitised reason. */
export function failedUpdate(
  code: string,
  message: string,
): {
  status: "failed";
  last_error_code: string;
  last_error_message: string;
  claim_token: null;
  claimed_at: null;
  claim_expires_at: null;
} {
  return {
    status: "failed",
    last_error_code: code,
    last_error_message: message,
    // The claim is released: a failed post is the owner's again.
    claim_token: null,
    claimed_at: null,
    claim_expires_at: null,
  };
}
