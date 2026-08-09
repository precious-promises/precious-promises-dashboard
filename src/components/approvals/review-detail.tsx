import { AlertTriangle, Check, Undo2, X } from "lucide-react";
import Link from "next/link";

import {
  approveVariant,
  rejectVariant,
  returnToDraft,
  submitForReview,
} from "@/app/dashboard/approvals/actions";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ReviewRow } from "@/lib/approvals/repository";
import type { ScriptRevision } from "@/lib/scripts/types";
import { PLATFORM_LABELS, VARIANT_TYPE_LABELS } from "@/lib/variants/types";

/**
 * The review surface for one platform variant.
 *
 * The layout carries a rule: **Scripture is separated from everything else.**
 * The verse is presented on its own, read-only, through the same component
 * used everywhere else — and the declaration, prayer, script and caption are
 * each in their own labelled block below it. A reviewer must never have to
 * work out which of these is the verse.
 *
 * Approval here publishes nothing. It records a decision and a fingerprint.
 */

function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3">
      <h4 className="text-xs font-semibold tracking-wide text-ink-secondary uppercase">
        {label}
      </h4>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>
      ) : null}
      <div className="mt-2 text-sm leading-6 whitespace-pre-line text-ink-primary">
        {children}
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-sm text-ink-muted">{children}</span>;
}

export function ReviewDetail({
  row,
  script,
}: {
  row: ReviewRow;
  script: ScriptRevision | null;
}) {
  const { variant, item } = row;
  const canApprove = row.blockers.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink-primary">
            {item.title}
          </h3>
          <p className="text-xs text-ink-muted">
            {PLATFORM_LABELS[variant.platform]} ·{" "}
            {VARIANT_TYPE_LABELS[variant.variant_type]}
          </p>
        </div>
        <Link
          href={`/dashboard/content/${item.id}`}
          className="text-xs text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Open content item
        </Link>
      </div>

      {row.validity === "invalidated" ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-gold-dim/50 bg-gold/10 px-3.5 py-2.5 text-sm text-gold"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          This variant was approved, then its content changed. The approval no
          longer describes what is stored, so it has been withdrawn and anything
          scheduled on it is paused.
        </p>
      ) : null}

      {/* Scripture first and alone. It is verified data, not copy. */}
      <Block
        label="Scripture"
        hint="Verified data. Read-only here and edited only in the Content Library."
      >
        <ScriptureReadOnly item={item} showLockNote={false} />
      </Block>

      <Block
        label="Caption"
        hint="What this platform publishes as the caption."
      >
        {variant.caption ?? <Empty>No caption written.</Empty>}
      </Block>

      <Block label="Title">
        {variant.title ?? <Empty>No title written.</Empty>}
      </Block>

      <Block label="Description">
        {variant.description ?? <Empty>No description written.</Empty>}
      </Block>

      <Block label="Hashtags">
        {variant.hashtags.length > 0 ? (
          variant.hashtags.map((tag) => `#${tag}`).join(" ")
        ) : (
          <Empty>None.</Empty>
        )}
      </Block>

      <Block
        label="Declaration"
        hint="The owner's own words. This is not Scripture."
      >
        {script?.declaration ?? <Empty>Nothing written.</Empty>}
      </Block>

      <Block
        label="Prayer"
        hint="The owner's own words. This is not Scripture."
      >
        {script?.prayer ?? <Empty>Nothing written.</Empty>}
      </Block>

      <Block
        label="Script"
        hint={
          row.latestScriptRevision
            ? `Revision ${row.latestScriptRevision}.`
            : "No script saved."
        }
      >
        {script?.explanation ?? <Empty>Nothing written.</Empty>}
      </Block>

      <Block label="Media and video">
        <span className="text-sm text-ink-secondary">
          {row.hasVideo
            ? "A video composition with scenes exists for this item."
            : "No video composition with scenes."}
          {" · "}
          {row.mediaCount === 1
            ? "1 media asset attached."
            : `${row.mediaCount} media assets attached.`}
        </span>
        <p className="mt-1 text-[11px] text-ink-muted">
          No render exists. Server rendering is not connected.
        </p>
      </Block>

      {row.blockers.length > 0 ? (
        <div className="rounded-lg border border-edge-strong/70 bg-panel-raised/50 px-3.5 py-3">
          <h4 className="text-xs font-semibold tracking-wide text-ink-secondary uppercase">
            Not approvable yet
          </h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {row.blockers.map((blocker) => (
              <li
                key={blocker.code}
                className="flex items-start gap-2 text-sm text-ink-secondary"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 text-gold"
                />
                {blocker.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-edge/70 pt-4">
        {variant.review_state === "draft" ? (
          <form action={submitForReview}>
            <input type="hidden" name="variant_id" value={variant.id} />
            <button
              type="submit"
              className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Submit for review
            </button>
          </form>
        ) : null}

        {variant.review_state === "rejected" && variant.rejection_reason ? (
          <p className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5 text-sm text-ink-secondary">
            <span className="font-medium text-ink-primary">Rejected:</span>{" "}
            {variant.rejection_reason}
          </p>
        ) : null}

        {variant.review_state === "ready_for_review" ? (
          <>
            <form action={approveVariant}>
              <input type="hidden" name="variant_id" value={variant.id} />
              <button
                type="submit"
                disabled={!canApprove}
                className="inline-flex items-center gap-2 rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check aria-hidden="true" className="size-4" />
                Approve this variant
              </button>
              <p className="mt-1.5 text-xs text-ink-muted">
                Approves {PLATFORM_LABELS[variant.platform]} only. Publishes
                nothing.
              </p>
            </form>

            <form action={rejectVariant} className="flex flex-col gap-2">
              <input type="hidden" name="variant_id" value={variant.id} />
              <label
                htmlFor="reason"
                className="text-xs font-medium text-ink-secondary"
              >
                Rejection reason
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={2}
                required
                maxLength={2000}
                className="w-full rounded-lg border border-edge bg-panel-raised/50 px-3 py-2 text-sm text-ink-primary outline-none focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35"
              />
              <button
                type="submit"
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <X aria-hidden="true" className="size-4" />
                Reject
              </button>
            </form>
          </>
        ) : null}

        {variant.review_state !== "draft" ? (
          <form action={returnToDraft}>
            <input type="hidden" name="variant_id" value={variant.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-edge px-4 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-panel-hover/60 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              <Undo2 aria-hidden="true" className="size-4" />
              Return to draft
            </button>
          </form>
        ) : null}

        {variant.review_state === "approved" && row.validity === "valid" ? (
          <div className="rounded-lg border border-positive/25 bg-positive/5 px-3.5 py-3">
            <StatusBadge tone="configured">Approved</StatusBadge>
            <p className="mt-2 text-sm text-ink-secondary">
              Ready to schedule. Approval records a decision — it sends nothing
              anywhere.
            </p>
            <Link
              href={`/dashboard/calendar?variant=${variant.id}`}
              className="mt-2 inline-block text-sm text-highlight underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Schedule this variant
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
