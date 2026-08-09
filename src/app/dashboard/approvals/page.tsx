import { CheckSquare } from "lucide-react";
import type { Metadata } from "next";
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

/**
 * The Approval Queue.
 *
 * **What makes a variant approvable**, in one place, enforced in
 * `src/lib/approvals/rules.ts` and re-checked in the server action:
 *
 * 1. Its content item is not archived.
 * 2. The variant is marked ready for review.
 * 3. If the item carries Scripture, that Scripture is manually verified.
 * 4. The variant has a title, caption or description — something to review.
 * 5. A content type published as video has a video composition with scenes.
 * 6. A content type published as an image has at least one media asset.
 *
 * Approval is per platform variant and touches exactly one row.
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              Approval Queue
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
              Approval is per platform. Approving the YouTube wording says
              nothing about Instagram, and approving anything publishes nothing.
            </p>
          </div>
          {notice && NOTICES[notice] ? (
            <p
              role="status"
              className="rounded-lg border border-edge-strong/70 bg-panel-raised/60 px-3 py-1.5 text-xs text-ink-secondary"
            >
              {NOTICES[notice]}
            </p>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={CheckSquare}
              title="Nothing to review yet."
              description="Write a caption for a platform in the Caption Studio and mark it ready for review; it will appear here."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
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

            <SectionCard
              title="Review"
              description={
                selected
                  ? "Scripture is shown separately from everything written."
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
        )}
      </div>
    </DashboardShell>
  );
}
