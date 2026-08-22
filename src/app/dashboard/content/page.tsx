import {
  Archive,
  BookOpenCheck,
  FileText,
  Library,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentFiltersBar } from "@/components/content/content-filters";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { hasActiveFilters, parseContentFilters } from "@/lib/content/filters";
import {
  countScriptureNeedingAttention,
  getContentCounts,
  listContentItems,
  listTopics,
} from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Content Library · Precious Promises",
  robots: { index: false, follow: false },
};

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Library;
}) {
  return (
    <div className="pp-glass rounded-2xl border border-edge p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-primary">
            {value}
          </p>
        </div>
        <span className="rounded-xl border border-edge bg-panel-hover/60 p-2.5 text-highlight">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-secondary">{description}</p>
    </div>
  );
}

export default async function ContentLibraryPage(
  props: PageProps<"/dashboard/content">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const filters = parseContentFilters(searchParams);
  const [items, topics, counts, scriptureNeedsAttention] = await Promise.all([
    listContentItems(filters),
    listTopics(),
    getContentCounts(),
    countScriptureNeedingAttention(),
  ]);

  const filtered = hasActiveFilters(filters);

  return (
    <DashboardShell
      title="Content Library"
      pathname="/dashboard/content"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-edge bg-panel px-5 py-6 shadow-sm sm:px-7 sm:py-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,var(--color-highlight-soft),transparent_68%)] opacity-20"
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-edge bg-panel-hover/70 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
                <Library
                  aria-hidden="true"
                  className="size-3.5 text-highlight"
                />
                Content command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Content Library
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
                Manage every owned content item from draft through review
                readiness, with Scripture verification kept visible before
                anything moves further through production.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/scripture"
                className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-panel-hover/50 px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <BookOpenCheck aria-hidden="true" className="size-4" />
                Scripture Studio
              </Link>
              <Link
                href="/dashboard/content/new"
                className="inline-flex items-center gap-2 rounded-xl bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <Plus aria-hidden="true" className="size-4" />
                Create Content
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Content library summary"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <MetricCard
            label="Total content"
            value={counts.total}
            description="All content records owned by this account."
            icon={Library}
          />
          <MetricCard
            label="Drafts"
            value={counts.draft}
            description="Items still being developed and not yet review-ready."
            icon={FileText}
          />
          <MetricCard
            label="Ready for review"
            value={counts.readyForReview}
            description="Content explicitly moved to human review readiness."
            icon={ShieldCheck}
          />
          <MetricCard
            label="Scripture attention"
            value={scriptureNeedsAttention}
            description="Referenced Scripture that is unverified or needs re-verification."
            icon={BookOpenCheck}
          />
          <MetricCard
            label="Archived"
            value={counts.archived}
            description="Items retained in the library but outside the active workflow."
            icon={Archive}
          />
        </section>

        <section className="pp-glass overflow-hidden rounded-2xl border border-edge">
          <div className="border-b border-edge px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Search
                    aria-hidden="true"
                    className="size-4 text-highlight"
                  />
                  <h3 className="text-base font-semibold text-ink-primary">
                    Find and filter content
                  </h3>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  Search titles, Scripture references and descriptions, then
                  narrow by type, topic, workflow status or Scripture
                  verification state.
                </p>
              </div>
              <p className="text-xs text-ink-muted" aria-live="polite">
                {items.length} {items.length === 1 ? "result" : "results"}
                {filtered ? " in the current view" : " currently shown"}
              </p>
            </div>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <ContentFiltersBar filters={filters} topics={topics} />
          </div>
        </section>

        {items.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
            {filtered ? (
              <EmptyState
                icon={FileText}
                title="No content matches these filters."
                description="Try widening the search, or clear the filters to see everything."
                action={
                  <Link
                    href="/dashboard/content"
                    className="rounded-lg border border-edge-strong px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No content yet."
                description="Create your first content item to start building the library. Nothing is published from here — this remains your working content space."
                action={
                  <Link
                    href="/dashboard/content/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Create Content
                  </Link>
                }
              />
            )}
          </div>
        ) : (
          <section aria-labelledby="library-results-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.13em] text-ink-muted uppercase">
                  Working library
                </p>
                <h3
                  id="library-results-heading"
                  className="mt-1 text-xl font-semibold tracking-tight text-ink-primary"
                >
                  {filtered ? "Filtered content" : "All recent content"}
                </h3>
              </div>
              <p className="text-xs text-ink-muted">
                Most recently updated items appear first.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-edge bg-panel/55 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-highlight"
            />
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Library truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                Draft and review-ready are content workflow states only. They do
                not mean approved, scheduled, published or live-verified.
                Scripture verification remains a separate human-controlled
                status.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
