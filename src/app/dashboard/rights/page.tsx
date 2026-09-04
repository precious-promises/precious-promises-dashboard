import Link from "next/link";
import {
  AlertTriangle,
  FileCheck2,
  Link2,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LicenceForm } from "@/components/rights/licence-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  LICENCE_STATUS_LABELS,
  licenceWarnings,
  SUGGESTED_RIGHTS_ENTRIES,
  type LicenceRecord,
} from "@/lib/rights/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rights & Licences · Precious Promises",
  robots: { index: false, follow: false },
};

function OverviewMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

/**
 * The Rights & Licences register: an administrative record of rights
 * provenance. It warns; it never concludes, and it never blocks.
 */
export default async function RightsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data } = await supabase
    .from("licence_records")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const records = (data ?? []) as LicenceRecord[];
  const warnings = licenceWarnings(records);
  const proofRecordedCount = records.filter(
    (record) => record.proof_reference !== null,
  ).length;
  const linkedAssetCount = records.filter(
    (record) => record.media_asset_id !== null,
  ).length;
  const needsAttentionCount = records.filter(
    (record) =>
      record.status === "needs_review" ||
      record.status === "expired" ||
      record.status === "expiring" ||
      record.status === "restricted",
  ).length;
  const expiryAttentionCount = warnings.filter(
    (warning) => warning.kind === "expired" || warning.kind === "expiring",
  ).length;

  return (
    <DashboardShell
      title="Rights & Licences"
      pathname="/dashboard/rights"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Rights evidence centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Rights &amp; Licences
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Keep the provenance, permitted use, proof and expiry information
                you actually hold for each asset in one operational register.
                Recorded information stays distinct from independent legal
                verification, so this screen can surface evidence and gaps
                without pretending to issue legal clearance.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/65">
              <p className="font-semibold text-white">Administrative boundary</p>
              <p className="mt-1 max-w-xs">
                This register records what is known and warns about gaps. It is
                not legal advice, does not independently verify a licence and
                does not automatically block publishing.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Rights evidence metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <OverviewMetric
            label="Registered"
            value={records.length}
            detail="Rights records currently stored"
          />
          <OverviewMetric
            label="Proof recorded"
            value={proofRecordedCount}
            detail="Entries carrying a proof reference"
          />
          <OverviewMetric
            label="Linked assets"
            value={linkedAssetCount}
            detail="Entries linked to a stored media asset"
          />
          <OverviewMetric
            label="Needs attention"
            value={needsAttentionCount}
            detail="Review, restriction or expiry status recorded"
          />
          <OverviewMetric
            label="Expiry alerts"
            value={expiryAttentionCount}
            detail="Derived expiry warnings currently surfaced"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Evidence chain
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Record the facts that support a usage decision
                </h3>
              </div>
              <StatusBadge tone={warnings.length > 0 ? "inactive" : "configured"}>
                {warnings.length > 0
                  ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
                  : "No current warnings"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "1",
                  "Identify",
                  "Name the asset and link the media record where one exists",
                ],
                [
                  "2",
                  "Record",
                  "Capture source, licence type, licensor and permitted use",
                ],
                [
                  "3",
                  "Evidence",
                  "Store the proof reference and any relevant date boundaries",
                ],
                [
                  "4",
                  "Review",
                  "Use warnings and restrictions as prompts for an owner decision",
                ],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-panel/40 px-4 py-4"
                >
                  <span className="text-xs font-semibold text-highlight">
                    {step}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-ink-primary">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <p className="text-sm font-semibold text-ink-primary">
              Rights truth boundary
            </p>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Rights record exists ≠ rights independently verified.</li>
              <li>Licence recorded ≠ permission is unlimited.</li>
              <li>No expiry stored ≠ perpetual licence.</li>
              <li>Proof reference exists ≠ evidence was legally validated.</li>
              <li>Asset linked ≠ approved for every platform or use.</li>
              <li>Internal note ≠ legal advice.</li>
            </ul>
          </div>
        </section>

        {warnings.length > 0 ? (
          <SectionCard
            title="Evidence attention queue"
            description="Recorded gaps, restrictions and expiry signals. Information only; never an automatic publishing block."
          >
            <ul className="grid gap-3 lg:grid-cols-2">
              {warnings.map((warning, index) => (
                <li
                  key={`${warning.recordId}-${warning.kind}-${index}`}
                  className="rounded-xl border border-gold-dim/50 bg-gold/10 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-gold"
                    />
                    <div>
                      <span className="text-sm font-medium text-gold">
                        {warning.assetLabel}
                      </span>
                      <p className="mt-0.5 text-xs leading-5 text-ink-secondary">
                        {warning.detail}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Rights register"
          description="Every stored entry remains an administrative record of the information you have supplied."
        >
          {records.length === 0 ? (
            <div className="flex flex-col gap-5">
              <EmptyState
                icon={ScrollText}
                title="Nothing recorded yet."
                description="The register starts empty. These are the rights questions this product already carries — record what you know about each."
              />
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Suggested starting records
                </p>
                <ul className="grid gap-2 md:grid-cols-2">
                  {SUGGESTED_RIGHTS_ENTRIES.map((entry) => (
                    <li
                      key={entry.label}
                      className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                    >
                      <span className="text-sm font-medium text-ink-primary">
                        {entry.label}
                      </span>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {entry.hint}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 xl:grid-cols-2">
              {records.map((record) => (
                <li
                  key={record.id}
                  className="rounded-2xl border border-edge/70 bg-panel-raised/40 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-primary">
                        {record.asset_label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {[
                          record.licence_type,
                          record.licensor ? `from ${record.licensor}` : null,
                          record.rights_source,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No source or licence details recorded"}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        record.status === "active"
                          ? "configured"
                          : record.status === "needs_review"
                            ? "inactive"
                            : "accent"
                      }
                    >
                      {LICENCE_STATUS_LABELS[record.status]}
                    </StatusBadge>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                        Evidence
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-secondary">
                        {record.proof_reference ?? "No proof reference recorded"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                        Dates
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-secondary">
                        {record.starts_on ? `Starts ${record.starts_on}` : "No start recorded"}
                        {record.expires_on
                          ? ` · Expires ${record.expires_on}`
                          : " · No expiry recorded"}
                      </p>
                    </div>
                  </div>

                  {record.permitted_use ? (
                    <div className="mt-3 rounded-xl border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                        Permitted use recorded
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink-secondary">
                        {record.permitted_use}
                      </p>
                    </div>
                  ) : null}

                  {record.notes ? (
                    <p className="mt-3 text-xs leading-5 text-ink-muted">
                      {record.notes}
                    </p>
                  ) : null}

                  {record.media_asset_id ? (
                    <Link
                      href="/dashboard/media"
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-highlight hover:text-highlight-soft"
                    >
                      <Link2 aria-hidden="true" className="size-3.5" />
                      Linked Media Asset
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <div className="flex items-center gap-2">
              <FileCheck2 aria-hidden="true" className="size-4 text-highlight" />
              <p className="text-sm font-semibold text-ink-primary">
                Before recording
              </p>
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Record only information you actually have.</li>
              <li>Leave unknown fields empty rather than inferring terms.</li>
              <li>Use the proof reference to point to evidence, not a conclusion.</li>
              <li>Use status and notes to surface uncertainty or restrictions.</li>
            </ul>
          </div>

          <SectionCard
            title="Add a record"
            description="What you know about an asset's rights, in your own words. Empty fields are gaps to fill, not blockers."
          >
            <LicenceForm />
          </SectionCard>
        </section>
      </div>
    </DashboardShell>
  );
}
