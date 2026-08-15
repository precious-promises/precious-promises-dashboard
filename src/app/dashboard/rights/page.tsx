import { ScrollText } from "lucide-react";
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

  return (
    <DashboardShell
      title="Rights & Licences"
      pathname="/dashboard/rights"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Rights &amp; Licences
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Where each asset&apos;s rights come from, written down. This is an
            administrative register, not legal advice — it warns about gaps and
            expiries, and the decisions stay yours.
          </p>
        </div>

        {warnings.length > 0 ? (
          <SectionCard
            title="Warnings"
            description="Information, never an automatic block on publishing."
          >
            <ul className="flex flex-col gap-2">
              {warnings.map((warning, index) => (
                <li
                  key={`${warning.recordId}-${warning.kind}-${index}`}
                  className="rounded-lg border border-gold-dim/50 bg-gold/10 px-3.5 py-2.5"
                >
                  <span className="text-sm font-medium text-gold">
                    {warning.assetLabel}
                  </span>
                  <p className="mt-0.5 text-xs leading-5 text-ink-secondary">
                    {warning.detail}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Register"
          description="Every recorded rights entry."
        >
          {records.length === 0 ? (
            <div className="flex flex-col gap-4">
              <EmptyState
                icon={ScrollText}
                title="Nothing recorded yet."
                description="The register starts empty. These are the rights questions this product already carries — record what you know about each."
              />
              <ul className="flex flex-col gap-1.5">
                {SUGGESTED_RIGHTS_ENTRIES.map((entry) => (
                  <li
                    key={entry.label}
                    className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2"
                  >
                    <span className="text-sm font-medium text-ink-primary">
                      {entry.label}
                    </span>
                    <p className="text-[11px] leading-5 text-ink-muted">
                      {entry.hint}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {records.map((record) => (
                <li
                  key={record.id}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
                      {record.asset_label}
                    </span>
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
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {[
                      record.licence_type,
                      record.licensor ? `from ${record.licensor}` : null,
                      record.rights_source,
                      record.expires_on
                        ? `expires ${record.expires_on}`
                        : "no expiry recorded",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {record.permitted_use ? (
                    <p className="mt-1 text-xs leading-5 text-ink-secondary">
                      Permitted use: {record.permitted_use}
                    </p>
                  ) : null}
                  {record.notes ? (
                    <p className="mt-1 text-xs leading-5 text-ink-muted">
                      {record.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Add a record"
          description="What you know about an asset's rights, in your own words. Empty fields are gaps to fill, not blockers."
        >
          <LicenceForm />
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
