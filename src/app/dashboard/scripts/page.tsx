import {
  BookOpen,
  FileClock,
  FileText,
  PenLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { draftedGenerationsFor } from "@/app/dashboard/ai/actions";
import { AiDraftPanel } from "@/components/ai/draft-panel";
import { ItemPicker } from "@/components/content/item-picker";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptForm } from "@/components/scripts/script-form";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { isAiConfigured } from "@/lib/ai/server-config";
import { SCRIPT_GENERATION_TYPES } from "@/lib/ai/types";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import { getContentItem, listContentItems } from "@/lib/content/repository";
import {
  getLatestRevision,
  listScriptRevisions,
} from "@/lib/scripts/repository";
import {
  SCRIPT_SECTION_LABELS,
  SPOKEN_SECTIONS,
  nextRevisionNumber,
} from "@/lib/scripts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Script Studio · Precious Promises",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 px-4 py-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink-primary">{value}</p>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

export default async function ScriptStudioPage(
  props: PageProps<"/dashboard/scripts">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const selectedId = firstParam(searchParams.item);

  const items = await listContentItems(EMPTY_FILTERS);
  const item = selectedId ? await getContentItem(selectedId) : null;

  const [revisions, latest, drafts] = item
    ? await Promise.all([
        listScriptRevisions(item.id),
        getLatestRevision(item.id),
        draftedGenerationsFor(item.id),
      ])
    : [[], null, []];
  const scriptDrafts = drafts.filter((draft) =>
    SCRIPT_GENERATION_TYPES.includes(draft.generation_type),
  );

  const nextRevision = nextRevisionNumber(latest?.revision_number ?? null);
  const scriptureRecorded = Boolean(
    item?.scripture_reference && item?.scripture_text,
  );
  const scriptureVerified =
    item?.scripture_verification_status === "manually_verified";

  return (
    <DashboardShell
      title="Script Studio"
      pathname="/dashboard/scripts"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.25),transparent_34%),radial-gradient(circle_at_80%_8%,rgba(201,169,97,0.10),transparent_27%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]" />
          <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-7 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <PenLine aria-hidden="true" className="size-3.5" />
                Writing Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">Turn verified source material into polished spoken content</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Build the spoken piece around verified source material without mixing authored prose into Scripture. Every save creates a new revision, so earlier work remains available for review.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link href="/dashboard/scripture" className="rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">
                Scripture Studio
              </Link>
              <Link href="/dashboard/captions" className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">
                Caption Studio
              </Link>
            </div>
          </div>

          <div className="relative grid gap-3 border-t border-edge/70 bg-black/10 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5 lg:px-8">
            <Metric label="Content Items" value={items.length} detail="Available to select for script work" />
            <Metric label="Revisions" value={revisions.length} detail={item ? "Saved for the selected item" : "Select an item"} />
            <Metric label="Next Revision" value={item ? nextRevision : "—"} detail="A save never overwrites earlier revisions" />
            <Metric label="AI Drafts" value={item ? scriptDrafts.length : "—"} detail="Draft suggestions for the selected item" />
            <Metric
              label="Scripture"
              value={!item ? "—" : scriptureVerified ? "Verified" : scriptureRecorded ? "Review" : "Missing"}
              detail="Stored Scripture remains read-only here"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)] sm:p-5">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">Choose the content item</h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">The script, revision history and AI drafts below always belong to the selected content item.</p>
            </div>
          </div>
          <ItemPicker action="/dashboard/scripts" items={items} selectedId={selectedId} />
        </section>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90">
            <EmptyState
              icon={FileText}
              title="No content to write for yet."
              description="Create a content item first, then come back to write its script."
              action={
                <Link href="/dashboard/content/new" className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">
                  Create Content
                </Link>
              }
            />
          </div>
        ) : !item ? (
          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90">
            <EmptyState icon={FileText} title="Choose a content item." description="Select an item above to write or revise its script." />
          </div>
        ) : (
          <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.72fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <SectionCard
                title={`Script — ${item.title}`}
                description={latest ? `Editing from revision ${latest.revision_number}. Saving creates revision ${nextRevision}.` : "No script yet. Saving creates revision 1."}
              >
                <div className="mb-4 rounded-xl border border-gold-dim/25 bg-gold/[0.035] px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
                    <p className="text-xs leading-5 text-ink-secondary">
                      Hook, explanation, declaration, prayer and outro are authored script sections. Declarations and prayers are your own words, not Scripture, and are never presented as Scripture. Private notes are not part of the spoken piece.
                    </p>
                  </div>
                </div>

                <ScriptForm contentItemId={item.id} latest={latest} nextRevision={nextRevision} />
              </SectionCard>

              <SectionCard
                title="AI drafting"
                description="Drafts on request, decided by you. An accepted draft becomes a new revision through the same save path — nothing is overwritten and nothing is approved by it."
              >
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#7138dc]/20 bg-[#7138dc]/[0.055] px-4 py-3">
                  <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#bda7ff]" />
                  <p className="text-xs leading-5 text-ink-secondary">AI output is draft prose only. It does not verify Scripture, approve content, or replace the human revision decision.</p>
                </div>
                <AiDraftPanel
                  contentItemId={item.id}
                  offeredTypes={SCRIPT_GENERATION_TYPES}
                  drafts={scriptDrafts}
                  variants={[]}
                  configured={isAiConfigured()}
                  hasScripture={scriptureRecorded}
                />
              </SectionCard>

              <SectionCard title="Revision history" description={`${revisions.length} ${revisions.length === 1 ? "revision" : "revisions"} saved.`}>
                {revisions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-edge px-4 py-6 text-sm text-ink-muted">Nothing saved yet. Your first save becomes revision 1.</div>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {revisions.map((revision) => (
                      <li key={revision.id} className="rounded-xl border border-edge/70 bg-[#0b1120]/70 px-3.5 py-3">
                        <details>
                          <summary className="cursor-pointer text-sm font-medium text-ink-primary marker:text-ink-muted">
                            Revision {revision.revision_number}
                            <span className="ml-2 text-xs font-normal text-ink-muted">{formatDate(revision.created_at)}</span>
                          </summary>
                          <dl className="mt-3 flex flex-col gap-3 border-t border-edge/70 pt-3">
                            {SPOKEN_SECTIONS.map((section) =>
                              revision[section] ? (
                                <div key={section}>
                                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{SCRIPT_SECTION_LABELS[section]}</dt>
                                  <dd className="mt-1 text-sm leading-6 whitespace-pre-wrap text-ink-secondary">{revision[section]}</dd>
                                </div>
                              ) : null,
                            )}
                          </dl>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </SectionCard>
            </div>

            <aside className="flex min-w-0 flex-col gap-6 2xl:sticky 2xl:top-24">
              <SectionCard title="Scripture source" description="Read-only here. Wording changes belong in the Content Library.">
                <ScriptureReadOnly item={item} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/dashboard/scripture" className="rounded-xl border border-edge-strong px-3.5 py-2 text-xs font-medium text-ink-primary transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">Review Scripture</Link>
                  <Link href={`/dashboard/content/${item.id}`} className="rounded-xl border border-edge-strong px-3.5 py-2 text-xs font-medium text-ink-primary transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">View content</Link>
                </div>
              </SectionCard>

              <SectionCard title="Writing status" description="Evidence from the selected item only.">
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-edge/70 pb-3">
                    <dt className="flex items-center gap-2 text-ink-muted"><FileClock aria-hidden="true" className="size-4" />Latest revision</dt>
                    <dd className="font-medium text-ink-primary">{latest ? latest.revision_number : "None"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-edge/70 pb-3">
                    <dt className="flex items-center gap-2 text-ink-muted"><Sparkles aria-hidden="true" className="size-4" />AI drafts</dt>
                    <dd className="font-medium text-ink-primary">{scriptDrafts.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-ink-muted"><BookOpen aria-hidden="true" className="size-4" />Scripture verification</dt>
                    <dd className="text-right font-medium text-ink-primary">{scriptureVerified ? "Manually verified" : scriptureRecorded ? "Needs review" : "Not complete"}</dd>
                  </div>
                </dl>
              </SectionCard>

              <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold-dim/35 bg-gold/10 text-gold"><ShieldCheck aria-hidden="true" className="size-4" /></span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink-primary">Script truth boundary</h3>
                    <p className="mt-1 text-xs leading-5 text-ink-muted">A saved revision proves only that script prose was saved. It is not approval, scheduling or publication. AI drafts remain drafts until accepted through the normal revision path, and Scripture remains structurally separate from every script field.</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
