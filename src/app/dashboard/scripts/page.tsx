import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ItemPicker } from "@/components/content/item-picker";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptForm } from "@/components/scripts/script-form";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
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

  const [revisions, latest] = item
    ? await Promise.all([
        listScriptRevisions(item.id),
        getLatestRevision(item.id),
      ])
    : [[], null];

  const nextRevision = nextRevisionNumber(latest?.revision_number ?? null);

  return (
    <DashboardShell
      title="Script Studio"
      pathname="/dashboard/scripts"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Script Studio
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Write the spoken piece. Every save creates a new revision, so
            earlier drafts stay readable.
          </p>
        </div>

        <div className="pp-glass rounded-xl border border-edge px-4 py-4">
          <ItemPicker
            action="/dashboard/scripts"
            items={items}
            selectedId={selectedId}
          />
        </div>

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
          <>
            <SectionCard
              title="Scripture"
              description="Read-only. Edit it in the Content Library."
            >
              <ScriptureReadOnly item={item} />
            </SectionCard>

            <SectionCard
              title={`Script — ${item.title}`}
              description={
                latest
                  ? `Editing from revision ${latest.revision_number}. Saving creates revision ${nextRevision}.`
                  : "No script yet. Saving creates revision 1."
              }
            >
              <ScriptForm
                contentItemId={item.id}
                latest={latest}
                nextRevision={nextRevision}
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
                        <dl className="mt-3 flex flex-col gap-3">
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
          </>
        )}
      </div>
    </DashboardShell>
  );
}
