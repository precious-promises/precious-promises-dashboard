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
    <div className="rounded-xl border border-edge bg-panel-raised/45 px-4 py-4">
      <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="overflow-hidden rounded-2xl border border-edge bg-panel-raised/55 shadow-sm">
          <div className="border-b border-edge px-5 py-5 sm:px-6 lg:flex lg:items-end lg:justify-between lg:gap-8">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-highlight uppercase">
                <PenLine aria-hidden="true" className="size-4" />
                Writing command centre
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
                Script Studio
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                Build the spoken piece around verified source material without
                mixing authored prose into Scripture. Every save creates a new
                revision, so earlier work remains available for review.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 lg:mt-0 lg:justify-end">
              <Link
                href="/dashboard/scripture"
                className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Scripture Studio
              </Link>
              <Link
                href="/dashboard/captions"
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Caption Studio
              </Link>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
            <Metric
              label="Content Items"
              value={items.length}
              detail="Available to select for script work"
            />
            <Metric
              label="Revisions"
              value={revisions.length}
              detail={item ? "Saved for the selected item" : "Select an item"}
            />
            <Metric
              label="Next Revision"
              value={item ? nextRevision : "—"}
              detail="A save never overwrites earlier revisions"
            />
            <Metric
              label="AI Drafts"
              value={item ? scriptDrafts.length : "—"}
              detail="Draft suggestions for the selected item"
            />
            <Metric
              label="Scripture"
              value={
                !item
                  ? "—"
                  : scriptureVerified
                    ? "Verified"
                    : scriptureRecorded
                      ? "Review"
                      : "Missing"
              }
              detail="Stored Scripture remains read-only here"
            />
          </div>
        </section>

        <section className="rounded-xl border border-edge bg-panel-raised/35 p-4 sm:p-5">
          <div className="mb-3 flex items-start gap-3">
            <FileText aria-hidden="true" className="mt-0.5 size-5 text-highlight" />
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Choose the content item
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                The script, revision history and AI drafts below always belong
                to the selected content item.
              </p>
            </div>
          </div>
          <ItemPicker
            action="/dashboard/scripts"
            items={items}
            selectedId={selectedId}
          />
        </section>

        {items.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={FileText}
              title="No content to write for yet."
              description="Create a content item first, then come back to write its script."
              action={
                <Link
                  href="/dashboard/content/new"
                  className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Create Content
                </Link>
              }
            />
          </div>
        ) : !item ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={FileText}
              title="Choose a content item."
              description="Select an item above to write or revise its script."
            />
          </div>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.8fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <SectionCard
                title={`Script — ${item.title}`}
                description={
                  latest
                    ? `Editing from revision ${latest.revision_number}. Saving creates revision ${nextRevision}.`
                    : "No script yet. Saving creates revision 1."
                }
              >
                <div className="mb-4 rounded-lg border border-edge bg-panel-raised/45 px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-highlight"
                    />
                    <p className="text-xs leading-5 text-ink-secondary">
                      Hook, explanation, declaration, prayer and outro are
                      authored script sections. Declarations and prayers are
                      your own words, not Scripture, and are never presented as
                      Scripture. Private notes are not part of the spoken piece.
                    </p>
                  </div>
                </div>

                <ScriptForm
                  contentItemId={item.id}
                  latest={latest}
                  nextRevision={nextRevision}
                />
              </SectionCard>

              <SectionCard
                title="AI drafting"
                description="Drafts on request, decided by you. An accepted draft becomes a new revision through the same save path — nothing is overwritten and nothing is approved by it."
              >
                <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-edge bg-panel-raised/45 px-4 py-3">
                  <Sparkles
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-highlight"
                  />
                  <p className="text-xs leading-5 text-ink-secondary">
                    AI output is draft prose only. It does not verify Scripture,
                    approve content, or replace the human revision decision.
                  </p>
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

              <SectionCard
                title="Revision history"
                description={`${revisions.length} ${revisions.length === 1 ? "revision" : "revisions"} saved.`}
              >
                {revisions.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Nothing saved yet. Your first save becomes revision 1.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {revisions.map((revision) => (
                      <li
                        key={revision.id}
                        className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3"
                      >
                        <details>
                          <summary className="cursor-pointer text-sm font-medium text-ink-primary marker:text-ink-muted">
                            Revision {revision.revision_number}
                            <span className="ml-2 text-xs font-normal text-ink-muted">
                              {formatDate(revision.created_at)}
                            </span>
                          </summary>
                          <dl className="mt-3 flex flex-col gap-3 border-t border-edge/70 pt-3">
                            {SPOKEN_SECTIONS.map((section) =>
                              revision[section] ? (
                                <div key={section}>
                                  <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                                    {SCRIPT_SECTION_LABELS[section]}
                                  </dt>
                                  <dd className="mt-1 text-sm leading-6 whitespace-pre-wrap text-ink-secondary">
                                    {revision[section]}
                                  </dd>
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

            <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-24">
              <SectionCard
                title="Scripture source"
                description="Read-only here. Wording changes belong in the Content Library."
              >
                <ScriptureReadOnly item={item} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/scripture"
                    className="rounded-lg border border-edge-strong px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    Review Scripture
                  </Link>
                  <Link
                    href={`/dashboard/content/${item.id}`}
                    className="rounded-lg border border-edge-strong px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    View content
                  </Link>
                </div>
              </SectionCard>

              <SectionCard
                title="Writing status"
                description="Evidence from the selected item only."
              >
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-edge/70 pb-3">
                    <dt className="flex items-center gap-2 text-ink-muted">
                      <FileClock aria-hidden="true" className="size-4" />
                      Latest revision
                    </dt>
                    <dd className="font-medium text-ink-primary">
                      {latest ? latest.revision_number : "None"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-edge/70 pb-3">
                    <dt className="flex items-center gap-2 text-ink-muted">
                      <Sparkles aria-hidden="true" className="size-4" />
                      AI drafts
                    </dt>
                    <dd className="font-medium text-ink-primary">
                      {scriptDrafts.length}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-ink-muted">
                      <BookOpen aria-hidden="true" className="size-4" />
                      Scripture verification
                    </dt>
                    <dd className="text-right font-medium text-ink-primary">
                      {scriptureVerified
                        ? "Manually verified"
                        : scriptureRecorded
                          ? "Needs review"
                          : "Not complete"}
                    </dd>
                  </div>
                </dl>
              </SectionCard>

              <div className="rounded-xl border border-gold-dim/30 bg-panel-raised/40 px-4 py-4">
                <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">
                  Script truth boundary
                </p>
                <p className="mt-2 text-xs leading-5 text-ink-secondary">
                  A saved revision proves only that script prose was saved. It
                  is not approval, scheduling or publication. AI drafts remain
                  drafts until accepted through the normal revision path, and
                  Scripture remains structurally separate from every script
                  field.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
