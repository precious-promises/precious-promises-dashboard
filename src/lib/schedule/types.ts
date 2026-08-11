import type { ContentType } from "@/lib/content/types";
import type { VariantPlatform } from "@/lib/variants/types";
import type { ProcessingStatus } from "@/lib/youtube/types";

import { DEFAULT_TIMEZONE } from "./timezone";

/**
 * Scheduling vocabulary.
 *
 * Stage 5 stopped this list at `scheduled`, because nothing executed a
 * schedule. Stage 6 added the execution statuses and the dispatcher that
 * drives them, and Stage 7 added the platform's own processing state on top.
 *
 * The rule those additions preserve: **a status is only written when something
 * genuinely reached it.** `posted` cannot be written without the platform's own
 * post id — `postedUpdate` returns `null` without one, and the database refuses
 * the row — and `external_processing_status` is kept separate from it, because
 * an upload the platform accepted is not yet a video anybody can watch.
 */

export const SCHEDULE_STATUSES = [
  "scheduled",
  "paused",
  "queued",
  "publishing",
  "posted",
  "failed",
  "cancelled",
] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  queued: "Queued",
  publishing: "Publishing",
  posted: "Posted",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Statuses the *interface* may show as an outcome.
 *
 * `posted` is in the vocabulary because the worker lifecycle needs somewhere
 * to land — but nothing can reach it in Stage 6: no provider exists, and the
 * database refuses `posted` without the platform's own post id.
 */
export const OUTCOME_SCHEDULE_STATUSES: readonly ScheduleStatus[] = [
  "posted",
  "failed",
];

/**
 * States a future provider will need, kept out of the live vocabulary.
 *
 * A provider that can only reach a platform's draft, or that requires the
 * owner to finish the post by hand, needs somewhere honest to stop. Both are
 * named in the database's check constraint so the shape is agreed — and
 * **neither is in `SCHEDULE_STATUSES`**, so nothing can be written into one
 * until the provider that needs it exists.
 */
export const FUTURE_SCHEDULE_STATUSES = [
  "ready_for_manual_post",
  "uploaded_to_platform_draft",
] as const;

export interface ScheduledPost {
  id: string;
  owner_id: string;
  platform_variant_id: string;
  /** UTC instant, ISO 8601. */
  scheduled_for: string;
  timezone: string;
  status: ScheduleStatus;
  approval_hash: string;
  recurring_rule_id: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;

  // Stage 6 execution columns. The claim triple is all-or-nothing, and
  // `external_post_id` is what makes `posted` unfakeable.
  attempt_count: number;
  claimed_at: string | null;
  claim_token: string | null;
  claim_expires_at: string | null;
  claimed_by: string | null;
  queued_at: string | null;
  publishing_started_at: string | null;
  posted_at: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
  last_error_code: string | null;
  last_error_message: string | null;

  /**
   * The platform's own processing state after a successful upload.
   *
   * Added in Stage 7. **Uploaded is not published:** YouTube accepts the bytes,
   * returns an id, and then processes the video — which can fail for a corrupt
   * file, a copyright claim or a policy rejection. Conflating the two would
   * assert a video is live when the audience never saw it.
   */
  external_processing_status: ProcessingStatus | null;
  external_processing_checked_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface RecurringScheduleRule {
  id: string;
  owner_id: string;
  name: string;
  platform: VariantPlatform;
  content_type: ContentType | null;
  /** 0 = Sunday, matching `Date.prototype.getDay`. */
  day_of_week: number;
  /** `HH:mm:ss` as stored by Postgres `time`. */
  local_time: string;
  timezone: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayLabel(day: number): string {
  return WEEKDAYS[day] ?? "";
}

/**
 * The approved Precious Promises posting rhythm.
 *
 * These are **suggestions the owner can create and enable**, not rules that
 * exist. Nothing here writes a row, and a rule that were created from this
 * list still arrives disabled — a schedule nobody agreed to would be worse
 * than no schedule at all.
 */
export interface SchedulePreset {
  name: string;
  platform: VariantPlatform;
  contentType: ContentType | null;
  dayOfWeek: number;
  localTime: string;
  timezone: string;
}

export const SCHEDULE_PRESETS: readonly SchedulePreset[] = [
  {
    name: "Promise Short",
    platform: "youtube",
    contentType: "youtube_short",
    dayOfWeek: 2,
    localTime: "19:30",
    timezone: DEFAULT_TIMEZONE,
  },
  {
    name: "Prayer / Declaration",
    platform: "youtube",
    contentType: "youtube_prayer_video",
    dayOfWeek: 4,
    localTime: "19:30",
    timezone: DEFAULT_TIMEZONE,
  },
  {
    name: "Long-form YouTube",
    platform: "youtube",
    contentType: "youtube_long_video",
    dayOfWeek: 6,
    localTime: "18:00",
    timezone: DEFAULT_TIMEZONE,
  },
  {
    name: "Encouragement Short",
    platform: "youtube",
    contentType: "youtube_short",
    dayOfWeek: 0,
    localTime: "09:00",
    timezone: DEFAULT_TIMEZONE,
  },
];

/** `HH:mm:ss` or `HH:mm` from the database, shown as `HH:mm`. */
export function shortLocalTime(localTime: string): string {
  return localTime.slice(0, 5);
}
