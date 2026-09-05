import {
  Archive,
  ArrowUpRight,
  BookOpenCheck,
  FileText,
  Library,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  accent,
}: {
  label: string;
  value: number;
  description: string;
  icon: LucideIcon;
  accent: "purple" | "gold" | "blue" | "green" | "neutral";
}) {
  const accentClasses = {
    purple: "border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]",
    gold: "border-gold-dim/35 bg-gold/10 text-gold",
    blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
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
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{description}</p>
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
  const activeWorkflowCount = Math.max(counts.total - counts.archived, 0);

  return (
    <DashboardShell
      title="Content Library"
      pathname="/dashboard/content"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.24),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.11),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Content Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Your complete content library
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Create, find and manage every owned content item while keeping
                Scripture verification, review readiness and workflow state
                visible before anything moves further into production.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href="/dashboard/content/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Create content
                </Link>
                <Link
                  href="/dashboard/scripture"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  <BookOpenCheck aria-hidden="true" className="size-4" />
                  Scripture Studio
                </Link>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[310px]">
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Active workflow
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {activeWorkflowCount}
                </p>
              </div>
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Current view
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {items.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Content library summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          <MetricCard
            label="Total content"
            value={counts.total}
            description="All content records owned by this account."
            icon={Library}
            accent="purple"
          />
          <MetricCard
            label="Drafts"
            value={counts.draft}
            description="Items still being developed."
            icon={FileText}
            accent="neutral"
          />
          <MetricCard
            label="Ready for review"
            value={counts.readyForReview}
            description="Explicitly moved to human review readiness."
            icon={ShieldCheck}
            accent="gold"
          />
          <MetricCard
            label="Scripture attention"
            value={scriptureNeedsAttention}
            description="Unverified or needing re-verification."
            icon={BookOpenCheck}
            accent="blue"
          />
          <MetricCard
            label="Archived"
            value={counts.archived}
            description="Retained outside the active workflow."
            icon={Archive}
            accent="green"
          />
        </section>

        <section className="overflow-hidden rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-3 border-b border-edge/70 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
                <Search aria-hidden="true" className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink-primary">
                  Find exactly what you need
                </h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
                  Search titles, Scripture references and descriptions, then
                  narrow by type, topic, workflow status or Scripture
                  verification state.
                </p>
              </div>
            </div>
            <p
              className="text-xs font-medium text-ink-secondary"
              aria-live="polite"
            >
              {items.length} {items.length === 1 ? "result" : "results"}
              {filtered
                ? " in this filtered view"
                : " in the current library view"}
            </p>
          </div>
          <div className="px-4 py-4 sm:px-5">
            <ContentFiltersBar filters={filters} topics={topics} />
          </div>
        </section>

        {items.length === 0 ? (
          <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
            {filtered ? (
              <EmptyState
                icon={Search}
                title="No content matches these filters."
                description="Try widening the search, or clear the filters to see the full library."
                action={
                  <Link
                    href="/dashboard/content"
                    className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-semibold text-ink-primary transition hover:bg-white/[0.055]"
                  >
                    Clear filters
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Library}
                title="Your library is ready."
                description="Create your first content item to begin the workflow. Nothing is published from this page."
                action={
                  <Link
                    href="/dashboard/content/new"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Create content
                  </Link>
                }
              />
            )}
          </section>
        ) : (
          <section aria-labelledby="library-results-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Working library
                </p>
                <h3
                  id="library-results-heading"
                  className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink-primary sm:text-2xl"
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

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Library truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Draft and ready-for-review are workflow states only. They do not
                mean approved, scheduled, published or live-verified. Scripture
                verification remains a separate human-controlled status.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
