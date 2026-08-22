import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileEdit,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ReviewDetail } from "@/components/approvals/review-detail";
import { VariantRow } from "@/components/approvals/variant-row";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { groupForQueue, loadReviewRows } from "@/lib/approvals/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getLatestRevision } from "@/lib/scripts/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Approval Queue · Precious Promises",
  robots: { index: false, follow: false },
};

const NOTICES: Record<string, string> = {
  approved:
    "Approved. Nothing has been published — approval records a decision.",
  rejected: "Rejected, with the reason recorded.",
  returned: "Returned to draft. Any approval on it has been cleared.",
  submitted: "Submitted for review.",
  blocked: "That variant cannot be approved yet. See the reasons listed.",
  "reason-required": "A rejection needs a reason.",
  "transition-refused": "That change is not allowed from the current state.",
  "approve-failed": "The approval could not be saved. Please try again.",
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof CheckSquare;
}) {
  return (
    <div className="rounded-2xl border border-edge bg-panel/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-primary">
            {value}
          </p>
        </div>
        <span className="rounded-xl border border-edge bg-panel-raised/70 p-2 text-highlight">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

/**
 * The Approval Queue.
 *
 * Approval is a human decision over one platform variant at a time. The server
 * action re-checks every blocker before it can persist that decision. Approval
 * never means scheduled, published or live-verified.
 */
export default async function ApprovalQueuePage(
  props: PageProps<"/dashboard/approvals">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const selectedId = firstParam(searchParams.variant);
  const notice = firstParam(searchParams.notice);

  const rows = await loadReviewRows();
  const groups = groupForQueue(rows);

  const selected =
    rows.find((row) => row.variant.id === selectedId) ??
    groups.readyForReview[0] ??
    null;

  const script = selected ? await getLatestRevision(selected.item.id) : null;

  const invalidated = rows.filter(
    (row) => row.validity === "invalidated",
  ).length;
  const scheduled = rows.filter((row) =>
    row.schedules.some((post) => post.status === "scheduled"),
  ).length;

  const sections = [
    { key: "ready", title: "Ready for Review", rows: groups.readyForReview },
    { key: "approved", title: "Approved", rows: groups.approved },
    { key: "rejected", title: "Rejected", rows: groups.rejected },
  ] as const;

  return (
    <DashboardShell
      title="Approval Queue"
      pathname="/dashboard/approvals"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(77,141,247,0.15),transparent_35%),linear-gradient(135deg,rgba(12,20,42,0.96),rgba(7,11,22,0.96))] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-highlight/30 bg-highlight/10 px-3 py-1 text-xs font-medium text-highlight-soft">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Human review command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Approval Queue
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Review each platform variant independently before it can move
                downstream. Approval records your decision only — it does not
                schedule or publish anything.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/captions"
                className="rounded-lg border border-edge-strong bg-panel-raised/70 px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Caption Studio
              </Link>
              <Link
                href="/dashboard/calendar"
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Content Calendar
              </Link>
            </div>
          </div>
        </section>

        {notice && NOTICES[notice] ? (
          <p
            role="status"
            className="rounded-xl border border-edge-strong/70 bg-panel-raised/60 px-4 py-3 text-sm text-ink-secondary"
          >
            {NOTICES[notice]}
          </p>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="Ready"
            value={groups.readyForReview.length}
            note="Platform variants currently awaiting a human decision."
            icon={Clock3}
          />
          <Metric
            label="Approved"
            value={groups.approved.length}
            note="Stored approvals that remain in the approved queue."
            icon={CheckCircle2}
          />
          <Metric
            label="Rejected"
            value={groups.rejected.length}
            note="Variants rejected with their review outcome retained."
            icon={XCircle}
          />
          <Metric
            label="Drafts"
            value={groups.draft.length}
            note="Variants not yet submitted for review."
            icon={FileEdit}
          />
          <Metric
            label="Stale Approval"
            value={invalidated}
            note="Approvals invalidated because the underlying content changed."
            icon={AlertTriangle}
          />
          <Metric
            label="Scheduled"
            value={scheduled}
            note="Reviewed variants that also have a real active schedule row."
            icon={CheckSquare}
          />
        </section>

        {invalidated > 0 ? (
          <div className="rounded-2xl border border-gold-dim/60 bg-gold/10 px-5 py-4">
            <p className="text-sm font-semibold text-gold">
              {invalidated} approval{invalidated === 1 ? "" : "s"} need fresh
              review.
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-secondary">
              The approved fingerprint no longer matches the stored content, so
              the old decision cannot be treated as current approval.
            </p>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
            <EmptyState
              icon={CheckSquare}
              title="Nothing to review yet."
              description="Write a caption for a platform in the Caption Studio and mark it ready for review; it will appear here."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col gap-4">
              {sections.map((section) => (
                <SectionCard
                  key={section.key}
                  title={section.title}
                  description={
                    section.rows.length === 0
                      ? "Nothing here."
                      : `${section.rows.length} ${section.rows.length === 1 ? "variant" : "variants"}.`
                  }
                >
                  {section.rows.length === 0 ? (
                    <p className="text-sm text-ink-muted">Nothing here.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {section.rows.map((row) => (
                        <VariantRow
                          key={row.variant.id}
                          row={row}
                          selected={selected?.variant.id === row.variant.id}
                        />
                      ))}
                    </ul>
                  )}
                </SectionCard>
              ))}

              {groups.draft.length > 0 ? (
                <SectionCard
                  title="Drafts"
                  description="Not yet submitted for review."
                >
                  <ul className="flex flex-col gap-2">
                    {groups.draft.map((row) => (
                      <VariantRow
                        key={row.variant.id}
                        row={row}
                        selected={selected?.variant.id === row.variant.id}
                      />
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
            </div>

            <div className="xl:sticky xl:top-24 xl:self-start">
              <SectionCard
                title="Review workspace"
                description={
                  selected
                    ? "Scripture is separated from generated or written copy so the source text stays visibly distinct."
                    : "Choose a variant to review."
                }
              >
                {selected ? (
                  <ReviewDetail row={selected} script={script} />
                ) : (
                  <p className="text-sm text-ink-muted">
                    Select a variant from the queue.
                  </p>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-edge bg-panel/55 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Approval truth boundary
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            Approval applies to one platform variant and one exact content
            fingerprint. It is not a schedule, publish attempt or live-platform
            result. If the underlying content changes, the earlier approval no
            longer proves that the current version was reviewed.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
