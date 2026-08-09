import Link from "next/link";

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { ReviewRow } from "@/lib/approvals/repository";
import {
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
} from "@/lib/content/types";
import { DEFAULT_TIMEZONE, formatInTimeZone } from "@/lib/schedule/timezone";
import { SCHEDULE_STATUS_LABELS } from "@/lib/schedule/types";
import {
  PLATFORM_LABELS,
  REVIEW_STATE_LABELS,
  VARIANT_TYPE_LABELS,
} from "@/lib/variants/types";

/**
 * One row in the Approval Queue.
 *
 * Shows enough to decide whether to open it: what it is, which platform, where
 * its Scripture stands, and whether anything is scheduled on it.
 *
 * A stale approval is called out here rather than only in the detail view — an
 * approval that no longer matches its content is the single most important
 * thing on this screen, and burying it one click away would defeat the point.
 */

const STATE_TONES: Record<string, StatusTone> = {
  draft: "inactive",
  ready_for_review: "accent",
  approved: "configured",
  rejected: "inactive",
};

function summarise(row: ReviewRow): string {
  const parts = [row.variant.title, row.variant.caption].filter(
    (value): value is string =>
      typeof value === "string" && value.trim() !== "",
  );
  const text = parts.join(" — ");
  return text.length > 120
    ? `${text.slice(0, 120)}…`
    : text || "No wording yet";
}

export function VariantRow({
  row,
  selected,
}: {
  row: ReviewRow;
  selected: boolean;
}) {
  const active = row.schedules.filter((post) => post.status === "scheduled");
  const paused = row.schedules.filter((post) => post.status === "paused");

  return (
    <li>
      <Link
        href={`/dashboard/approvals?variant=${row.variant.id}`}
        aria-current={selected ? "true" : undefined}
        className={
          selected
            ? "block rounded-lg border border-highlight/60 bg-highlight/10 px-3.5 py-3"
            : "block rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3 transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-primary">
              {row.item.title}
            </span>
            <span className="block text-xs text-ink-muted">
              {PLATFORM_LABELS[row.variant.platform]} ·{" "}
              {VARIANT_TYPE_LABELS[row.variant.variant_type]} ·{" "}
              {CONTENT_TYPE_LABELS[row.item.content_type]}
            </span>
          </span>
          <StatusBadge
            tone={STATE_TONES[row.variant.review_state] ?? "inactive"}
          >
            {REVIEW_STATE_LABELS[row.variant.review_state]}
          </StatusBadge>
        </div>

        <p className="mt-2 text-xs leading-5 text-ink-secondary">
          {summarise(row)}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          <span>
            Scripture:{" "}
            {row.item.scripture_reference
              ? `${row.item.scripture_reference} · ${SCRIPTURE_VERIFICATION_LABELS[row.item.scripture_verification_status]}`
              : "None recorded"}
          </span>
          <span>
            Script:{" "}
            {row.latestScriptRevision
              ? `Revision ${row.latestScriptRevision}`
              : "None"}
          </span>
          <span>Video: {row.hasVideo ? "Composition ready" : "None"}</span>
          <span>
            Updated{" "}
            {formatInTimeZone(
              new Date(row.variant.updated_at),
              DEFAULT_TIMEZONE,
            )}
          </span>
        </div>

        {row.validity === "invalidated" ? (
          <p className="mt-2 rounded-md border border-gold-dim/50 bg-gold/10 px-2.5 py-1.5 text-[11px] text-gold">
            The content changed after approval. This needs approving again.
          </p>
        ) : null}

        {active.length > 0 || paused.length > 0 ? (
          <p className="mt-2 text-[11px] text-ink-muted">
            {active.length > 0
              ? `${SCHEDULE_STATUS_LABELS.scheduled}: ${formatInTimeZone(new Date(active[0]!.scheduled_for), active[0]!.timezone)}`
              : `${SCHEDULE_STATUS_LABELS.paused}: ${paused[0]!.pause_reason}`}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
