import type { PlatformVariant } from "@/lib/variants/types";

import type { ScheduledPost, ScheduleStatus } from "./types";

/**
 * Scheduling safety.
 *
 * A schedule is only ever as trustworthy as the approval behind it, so every
 * rule here is about the relationship between the two. All of them are
 * re-checked on the server at the moment of saving — the page's opinion about
 * whether something is approved is never taken as evidence.
 */

export type ScheduleBlockerCode =
  "not_approved" | "approval_stale" | "time_invalid" | "time_in_past";

export interface ScheduleBlocker {
  code: ScheduleBlockerCode;
  message: string;
}

export interface ScheduleContext {
  variant: Pick<PlatformVariant, "review_state" | "approval_hash">;
  /** Whether the stored approval hash still matches the current content. */
  approvalMatches: boolean;
  /** The requested instant, or `null` if the date and time did not parse. */
  scheduledFor: Date | null;
  /** "Now", passed in so the rule is testable without mocking the clock. */
  now: Date;
}

/** Everything preventing this variant from being scheduled at this time. */
export function scheduleBlockers(context: ScheduleContext): ScheduleBlocker[] {
  const blockers: ScheduleBlocker[] = [];

  if (context.variant.review_state !== "approved") {
    blockers.push({
      code: "not_approved",
      message:
        "Only an approved variant can be scheduled. Approve it in the Approval Queue first.",
    });
  } else if (!context.approvalMatches) {
    // Approved, but the content moved underneath it. This is the case the
    // fingerprint exists for: without it, stale wording would keep its
    // approval and go out unchanged.
    blockers.push({
      code: "approval_stale",
      message:
        "This variant has changed since it was approved. It needs approving again before it can be scheduled.",
    });
  }

  if (
    context.scheduledFor === null ||
    Number.isNaN(context.scheduledFor.getTime())
  ) {
    blockers.push({
      code: "time_invalid",
      message: "That date and time could not be understood.",
    });
  } else if (context.scheduledFor.getTime() <= context.now.getTime()) {
    blockers.push({
      code: "time_in_past",
      message: "Choose a time in the future.",
    });
  }

  return blockers;
}

export function canSchedule(context: ScheduleContext): boolean {
  return scheduleBlockers(context).length === 0;
}

/**
 * An existing active schedule for the same variant at the same minute.
 *
 * Returned rather than refused outright, because scheduling the same variant
 * twice is unusual but not impossible — the interface warns and asks for
 * confirmation instead of deciding on the owner's behalf.
 */
export function findDuplicateSchedule(
  existing: Pick<
    ScheduledPost,
    "id" | "platform_variant_id" | "scheduled_for" | "status"
  >[],
  platformVariantId: string,
  scheduledFor: Date,
): { id: string } | null {
  const minute = Math.floor(scheduledFor.getTime() / 60_000);

  const match = existing.find(
    (post) =>
      post.status === "scheduled" &&
      post.platform_variant_id === platformVariantId &&
      Math.floor(new Date(post.scheduled_for).getTime() / 60_000) === minute,
  );

  return match ? { id: match.id } : null;
}

/**
 * The permitted schedule moves.
 *
 * `cancelled` is terminal: reinstating a cancelled post would resurrect an
 * approval decision that was deliberately withdrawn. Schedule a new one.
 *
 * `paused → scheduled` exists so a schedule paused by an invalidated approval
 * can be reinstated — but only ever by an explicit action after re-approval,
 * never automatically.
 */
const SCHEDULE_TRANSITIONS: Record<ScheduleStatus, readonly ScheduleStatus[]> =
  {
    scheduled: ["paused", "cancelled"],
    paused: ["scheduled", "cancelled"],
    cancelled: [],
  };

export function canTransitionSchedule(
  from: ScheduleStatus,
  to: ScheduleStatus,
): boolean {
  return SCHEDULE_TRANSITIONS[from].includes(to);
}

/** Statuses that still represent an intention to go out. */
export function isActiveSchedule(status: ScheduleStatus): boolean {
  return status === "scheduled";
}

/**
 * The update that pauses a schedule whose approval has been invalidated.
 *
 * Pausing rather than cancelling: the owner's intention to post at that time
 * has not changed — only the approval behind it has — and cancelling would
 * quietly throw the slot away. Nothing resumes it on its own.
 */
export function invalidationPause(reason: string, at: Date) {
  return {
    status: "paused" as const,
    paused_at: at.toISOString(),
    pause_reason: reason,
  };
}
