import type { ContentType } from "@/lib/content/types";
import type { VariantPlatform } from "@/lib/variants/types";

import { DEFAULT_TIMEZONE } from "./timezone";

/**
 * Scheduling vocabulary.
 *
 * **Nothing in this product executes a schedule.** No worker reads these rows,
 * no platform integration exists, and the statuses below deliberately stop at
 * `scheduled` — `publishing`, `posted` and `failed` are absent so the
 * interface cannot report an outcome no system produced.
 *
 * A scheduled post is an intention with a time attached, and the product says
 * exactly that wherever one is shown.
 */

export const SCHEDULE_STATUSES = ["scheduled", "paused", "cancelled"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  paused: "Paused",
  cancelled: "Cancelled",
};

/**
 * States a future publishing stage would add.
 *
 * Listed here so the gap is visible in the codebase rather than only in the
 * documentation — and **not** in `SCHEDULE_STATUSES`, so nothing can be
 * written into one of them today.
 */
export const FUTURE_SCHEDULE_STATUSES = [
  "publishing",
  "posted",
  "failed",
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
