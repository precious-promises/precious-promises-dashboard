import { BookOpen, Lock } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  SCRIPTURE_VERIFICATION_LABELS,
  type ContentItem,
  type ScriptureVerificationStatus,
} from "@/lib/content/types";

const VERIFICATION_TONES: Record<ScriptureVerificationStatus, StatusTone> = {
  unverified: "inactive",
  manually_verified: "configured",
  verification_required: "accent",
};

/**
 * Read-only Scripture display.
 *
 * Used wherever Scripture appears beside something editable — the Script
 * Studio and Caption Studio in particular. It renders text and never accepts
 * input, so a writing surface cannot become a route to altering a verse.
 *
 * The verse is presented as a `<blockquote>` with its reference in a
 * `<figcaption>`, visually and structurally distinct from the prose next to
 * it. Declarations and prayers never render through this component.
 */
export function ScriptureReadOnly({
  item,
  showLockNote = true,
}: {
  item: Pick<
    ContentItem,
    | "scripture_reference"
    | "scripture_text"
    | "scripture_translation"
    | "scripture_verification_status"
  >;
  showLockNote?: boolean;
}) {
  if (!item.scripture_reference && !item.scripture_text) {
    return (
      <p className="text-sm text-ink-muted">
        No Scripture recorded for this item. Add it in the Content Library.
      </p>
    );
  }

  return (
    <figure className="rounded-lg border border-gold-dim/30 bg-panel-raised/40 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-gold">
          <BookOpen aria-hidden="true" className="size-4" />
          {item.scripture_reference ?? "Reference not recorded"}
          <span className="text-ink-muted">{item.scripture_translation}</span>
        </p>
        <StatusBadge
          tone={VERIFICATION_TONES[item.scripture_verification_status]}
        >
          {SCRIPTURE_VERIFICATION_LABELS[item.scripture_verification_status]}
        </StatusBadge>
      </div>

      {item.scripture_text ? (
        <blockquote className="mt-3 border-l-2 border-gold-dim/50 pl-3 text-sm leading-6 text-ink-secondary">
          {item.scripture_text}
        </blockquote>
      ) : null}

      {showLockNote ? (
        <figcaption className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          <Lock aria-hidden="true" className="size-3" />
          Scripture is read-only here. Edit it in the Content Library.
        </figcaption>
      ) : null}
    </figure>
  );
}
