import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  ERROR_CATEGORY_LABELS,
  type ErrorCategory,
} from "@/lib/publishing/errors";
import {
  deriveQueueState,
  QUEUE_STATE_DETAIL,
  QUEUE_STATE_LABELS,
  type QueueState,
} from "@/lib/publishing/queue-state";
import type { QueueEntry } from "@/lib/publishing/repository";
import { ATTEMPT_STATUS_LABELS } from "@/lib/publishing/types";
import { formatInTimeZone } from "@/lib/schedule/timezone";
import { SCHEDULE_STATUS_LABELS } from "@/lib/schedule/types";
import { PLATFORM_LABELS, REVIEW_STATE_LABELS } from "@/lib/variants/types";

/**
 * One row in the Publish Queue, with its attempt history.
 *
 * The attempt list is the honest part of this screen. It shows what was tried,
 * when, and why it stopped — including the refusals this system made itself.
 * A queue that only showed successes would be a queue that never explained
 * anything.
 *
 * An external link appears **only** when a real external post id exists.
 *
 * The badge shows the derived queue state rather than the raw database status,
 * because the two are not the same question. `posted` in the database means the
 * platform returned an id; it does not mean the video is watchable, and the
 * row says which of those is true.
 */

const STATE_TONES: Record<QueueState, StatusTone> = {
  not_connected: "inactive",
  ready: "inactive",
  uploading: "accent",
  uploaded_processing: "accent",
  posted: "configured",
  failed: "accent",
  blocked: "accent",
  stood_down: "inactive",
};

function errorLabel(code: string | null): string {
  if (code === null) {
    return "";
  }
  return ERROR_CATEGORY_LABELS[code as ErrorCategory] ?? code;
}

export function PublishQueueEntry({
  entry,
  platformConnected = false,
}: {
  entry: QueueEntry;
  /** Whether an account for this row's platform is connected right now. */
  platformConnected?: boolean;
}) {
  const { post, variant, item, attempts } = entry;
  const latest = attempts[0] ?? null;

  const state = deriveQueueState({
    post,
    latestAttemptStatus: latest?.status ?? null,
    platformConnected,
  });

  return (
    <li className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <Link
            href={`/dashboard/content/${item.id}`}
            className="block text-sm font-medium text-ink-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            {item.title}
          </Link>
          <span className="block text-xs text-ink-muted">
            {PLATFORM_LABELS[variant.platform]} ·{" "}
            {formatInTimeZone(new Date(post.scheduled_for), post.timezone)} (
            {post.timezone})
          </span>
        </span>
        <StatusBadge tone={STATE_TONES[state]}>
          {QUEUE_STATE_LABELS[state]}
        </StatusBadge>
      </div>

      <p className="mt-1.5 text-[11px] text-ink-muted">
        {QUEUE_STATE_DETAIL[state]}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span>Schedule: {SCHEDULE_STATUS_LABELS[post.status]}</span>
        <span>Approval: {REVIEW_STATE_LABELS[variant.review_state]}</span>
        <span>
          {post.attempt_count === 1
            ? "1 attempt"
            : `${post.attempt_count} attempts`}
        </span>
        {post.external_post_id ? (
          post.external_post_url ? (
            <a
              href={post.external_post_url}
              rel="noreferrer noopener"
              target="_blank"
              className="text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              View on {PLATFORM_LABELS[variant.platform]}
            </a>
          ) : (
            <span>Platform id recorded</span>
          )
        ) : null}
      </div>

      {post.last_error_code ? (
        <p className="mt-2 flex items-start gap-2 rounded-md border border-gold-dim/50 bg-gold/10 px-2.5 py-1.5 text-[11px] text-gold">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0"
          />
          {errorLabel(post.last_error_code)}
          {post.last_error_message ? ` — ${post.last_error_message}` : ""}
        </p>
      ) : null}

      {attempts.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-ink-secondary hover:text-ink-primary">
            Attempt history ({attempts.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="rounded border border-edge/60 bg-panel/50 px-2.5 py-1.5 text-[11px]"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink-secondary">
                    Attempt {attempt.attempt_number} ·{" "}
                    {ATTEMPT_STATUS_LABELS[attempt.status]} · provider{" "}
                    {attempt.provider}
                  </span>
                  <span className="text-ink-muted">
                    {formatInTimeZone(
                      new Date(attempt.started_at),
                      post.timezone,
                    )}
                  </span>
                </span>
                {attempt.safe_error_code ? (
                  <span className="mt-1 block text-ink-muted">
                    {errorLabel(attempt.safe_error_code)} ·{" "}
                    {attempt.retryable === true
                      ? "Retryable"
                      : attempt.retryable === false
                        ? "Not retryable"
                        : "Retryability unknown"}
                  </span>
                ) : null}
                {attempt.safe_error_message ? (
                  <span className="mt-0.5 block text-ink-muted">
                    {attempt.safe_error_message}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* "Blocked — nothing reached a platform" used to be repeated here. It
          now lives on the detail line under the badge, said once. */}
    </li>
  );
}
