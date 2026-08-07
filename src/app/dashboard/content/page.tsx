import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentFiltersBar } from "@/components/content/content-filters";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { hasActiveFilters, parseContentFilters } from "@/lib/content/filters";
import { listContentItems, listTopics } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Content Library · Precious Promises",
  robots: { index: false, follow: false },
};

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
  const [items, topics] = await Promise.all([
    listContentItems(filters),
    listTopics(),
  ]);

  const filtered = hasActiveFilters(filters);

  return (
    <DashboardShell
      title="Content Library"
      pathname="/dashboard/content"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
              Content Library
            </h2>
            <p className="mt-1.5 text-sm text-ink-secondary">
              Every piece of content you have drafted, in one place.
            </p>
          </div>

          <Link
            href="/dashboard/content/new"
            className="inline-flex items-center gap-2 rounded-lg bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            <Plus aria-hidden="true" className="size-4" />
            Create Content
          </Link>
        </div>

        <div className="pp-glass rounded-xl border border-edge px-4 py-4">
          <ContentFiltersBar filters={filters} topics={topics} />
        </div>

        {items.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
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
                description="Create your first content item to start building the library. Nothing is published from here — this is your working draft space."
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
          <>
            <p className="text-sm text-ink-muted" aria-live="polite">
              {items.length} {items.length === 1 ? "item" : "items"}
              {filtered ? " matching your filters" : ""}
            </p>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <ContentCard key={item.id} item={item} />
              ))}
            </ul>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
