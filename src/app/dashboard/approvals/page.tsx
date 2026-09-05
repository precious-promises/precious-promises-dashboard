import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileEdit,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  accent,
}: {
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
  accent: "purple" | "gold" | "blue" | "green" | "red" | "neutral";
}) {
  const accentClasses = {
    purple: "border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]",
    gold: "border-gold-dim/35 bg-gold/10 text-gold",
    blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    red: "border-red-400/20 bg-red-400/10 text-red-200",
    neutral: "border-edge bg-white/[0.025] text-ink-secondary",
  } as const;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.035em] text-ink-primary">
            {value}
          </p>
        </div>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${accentClasses[accent]}`}
        >
          <Icon className="size-4" aria-hidden="true" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{note}</p>
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
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.24),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.11),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Human Review Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Decide what is ready to move forward
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Review each platform variant independently before it can move
                downstream. Approval records your decision only — it does not
                schedule, publish or prove anything is live.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href="/dashboard/captions"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  Caption Studio
                </Link>
                <Link
                  href="/dashboard/calendar"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  Content Calendar
                </Link>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[330px]">
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Awaiting decision
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {groups.readyForReview.length}
                </p>
              </div>
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Stale approvals
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {invalidated}
                </p>
              </div>
            </div>
          </div>
        </section>

        {notice && NOTICES[notice] ? (
          <p
            role="status"
            className="rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/[0.07] px-4 py-3 text-sm leading-6 text-ink-secondary shadow-[0_12px_35px_rgba(0,0,0,0.14)]"
          >
            {NOTICES[notice]}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <Metric
            label="Ready"
            value={groups.readyForReview.length}
            note="Platform variants awaiting a human decision."
            icon={Clock3}
            accent="purple"
          />
          <Metric
            label="Approved"
            value={groups.approved.length}
            note="Stored approvals still valid for their current content."
            icon={CheckCircle2}
            accent="green"
          />
          <Metric
            label="Rejected"
            value={groups.rejected.length}
            note="Variants with a retained rejection outcome."
            icon={XCircle}
            accent="red"
          />
          <Metric
            label="Drafts"
            value={groups.draft.length}
            note="Variants not yet submitted for human review."
            icon={FileEdit}
            accent="neutral"
          />
          <Metric
            label="Stale approval"
            value={invalidated}
            note="Old approvals invalidated by a content change."
            icon={AlertTriangle}
            accent="gold"
          />
          <Metric
            label="Scheduled"
            value={scheduled}
            note="Reviewed variants that also have an active schedule row."
            icon={CheckSquare}
            accent="blue"
          />
        </section>

        {invalidated > 0 ? (
          <section className="rounded-2xl border border-gold-dim/50 bg-gold/[0.07] px-4 py-4 shadow-[0_16px_45px_rgba(0,0,0,0.18)] sm:px-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/40 bg-gold/10 text-gold">
                <AlertTriangle aria-hidden="true" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gold">
                  {invalidated} approval{invalidated === 1 ? "" : "s"} need
                  fresh review.
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  The approved fingerprint no longer matches the stored content,
                  so the earlier decision cannot be treated as current approval.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {rows.length === 0 ? (
          <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
            <EmptyState
              icon={CheckSquare}
              title="Nothing to review yet."
              description="Write a caption for a platform in the Caption Studio and mark it ready for review; it will appear here."
            />
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
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
                  className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
                >
                  {section.rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-edge/80 bg-black/10 px-4 py-5 text-center text-sm text-ink-muted">
                      Nothing here.
                    </p>
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
                  className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
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
                className="shadow-[0_24px_70px_rgba(0,0,0,0.26)]"
              >
                {selected ? (
                  <ReviewDetail row={selected} script={script} />
                ) : (
                  <div className="rounded-xl border border-dashed border-edge/80 bg-black/10 px-4 py-8 text-center text-sm text-ink-muted">
                    Select a variant from the queue.
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Approval truth boundary
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Approval applies to one platform variant and one exact content
                fingerprint. It is not a schedule, publish attempt or
                live-platform result. If underlying content changes, the earlier
                approval no longer proves that the current version was reviewed.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
