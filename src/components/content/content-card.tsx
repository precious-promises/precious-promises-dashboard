import { BookOpen } from "lucide-react";
import Link from "next/link";

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
  type ContentItem,
  type ContentStatus,
  type ScriptureVerificationStatus,
} from "@/lib/content/types";

const STATUS_TONES: Record<ContentStatus, StatusTone> = {
  draft: "inactive",
  ready_for_review: "accent",
  archived: "inactive",
};

const VERIFICATION_TONES: Record<ScriptureVerificationStatus, StatusTone> = {
  unverified: "inactive",
  manually_verified: "configured",
  verification_required: "accent",
};

/** Date only — the time of day is noise in a library listing. */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ContentCard({ item }: { item: ContentItem }) {
  return (
    <li className="pp-glass rounded-xl border border-edge transition-colors hover:border-edge-strong">
      <Link
        href={`/dashboard/content/${item.id}`}
        className="flex flex-col gap-3 rounded-xl px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 text-base font-medium text-ink-primary">
            {item.title}
          </h3>
          <StatusBadge tone={STATUS_TONES[item.status]}>
            {CONTENT_STATUS_LABELS[item.status]}
          </StatusBadge>
        </div>

        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Content type</dt>
            <dd>{CONTENT_TYPE_LABELS[item.content_type]}</dd>
          </div>
          {item.topic ? (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Topic</dt>
              <dd className="rounded-full border border-edge px-2 py-0.5">
                {item.topic}
              </dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Last updated</dt>
            <dd>Updated {formatDate(item.updated_at)}</dd>
          </div>
        </dl>

        {item.scripture_reference ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-edge/60 pt-3">
            <BookOpen aria-hidden="true" className="size-3.5 text-gold" />
            <span className="text-xs font-medium text-gold">
              {item.scripture_reference}
            </span>
            <span className="text-xs text-ink-muted">
              {item.scripture_translation}
            </span>
            <StatusBadge
              tone={VERIFICATION_TONES[item.scripture_verification_status]}
              className="ml-auto"
            >
              {
                SCRIPTURE_VERIFICATION_LABELS[
                  item.scripture_verification_status
                ]
              }
            </StatusBadge>
          </div>
        ) : null}
      </Link>
    </li>
  );
}
