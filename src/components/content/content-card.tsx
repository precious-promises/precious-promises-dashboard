import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FolderKanban,
} from "lucide-react";
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

function contentTypeMarker(type: ContentItem["content_type"]): string {
  if (type.startsWith("youtube")) return "YT";
  if (type.startsWith("instagram")) return "IG";
  return "TT";
}

export function ContentCard({ item }: { item: ContentItem }) {
  const hasScripture = Boolean(item.scripture_reference);

  return (
    <li className="group pp-glass overflow-hidden rounded-2xl border border-edge transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-lg hover:shadow-black/5">
      <Link
        href={`/dashboard/content/${item.id}`}
        className="flex h-full flex-col rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge/70 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-edge bg-panel-hover/70 text-[10px] font-bold tracking-wide text-highlight">
              {contentTypeMarker(item.content_type)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-secondary">
                {CONTENT_TYPE_LABELS[item.content_type]}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                {item.topic ?? "No topic assigned"}
              </p>
            </div>
          </div>
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-highlight"
          />
        </div>

        <div className="flex flex-1 flex-col px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="min-w-0 flex-1 text-base font-semibold leading-6 text-ink-primary">
              {item.title}
            </h3>
            <StatusBadge tone={STATUS_TONES[item.status]}>
              {CONTENT_STATUS_LABELS[item.status]}
            </StatusBadge>
          </div>

          {item.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-secondary">
              {item.description}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              No description has been added yet.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel-hover/40 px-2.5 py-1">
              <CalendarDays aria-hidden="true" className="size-3" />
              Updated {formatDate(item.updated_at)}
            </span>
            {item.topic ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel-hover/40 px-2.5 py-1">
                <FolderKanban aria-hidden="true" className="size-3" />
                {item.topic}
              </span>
            ) : null}
          </div>

          <div className="mt-auto pt-4">
            {hasScripture ? (
              <div className="rounded-xl border border-edge/80 bg-panel-hover/35 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <BookOpen aria-hidden="true" className="size-3.5 text-gold" />
                  <span className="text-xs font-semibold text-gold">
                    {item.scripture_reference}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {item.scripture_translation}
                  </span>
                  <StatusBadge
                    tone={
                      VERIFICATION_TONES[item.scripture_verification_status]
                    }
                    className="ml-auto"
                  >
                    {
                      SCRIPTURE_VERIFICATION_LABELS[
                        item.scripture_verification_status
                      ]
                    }
                  </StatusBadge>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-edge px-3 py-2.5 text-[11px] text-ink-muted">
                No Scripture reference attached to this item.
              </div>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
