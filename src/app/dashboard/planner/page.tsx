import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  Link2,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PlannerForm } from "@/components/planner/planner-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { CONFIDENCE_LABELS } from "@/lib/growth/confidence";
import {
  buildPlannerRecommendations,
  recommendationAbsenceReason,
} from "@/lib/planner/recommendations";
import { listPlannerItems } from "@/lib/planner/repository";
import {
  buildPlannerViews,
  openTopicCounts,
  OPEN_PLANNER_STATUSES,
  PLANNER_PRIORITY_LABELS,
  PLANNER_STATUS_LABELS,
  type PlannerItem,
} from "@/lib/planner/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLATFORM_LABELS } from "@/lib/variants/types";

export const metadata: Metadata = {
  title: "Content Planner · Precious Promises",
  robots: { index: false, follow: false },
};

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof CalendarClock;
}) {
  return (
    <div className="rounded-2xl border border-edge bg-panel/70 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-primary">
            {value}
          </p>
        </div>
        <span className="rounded-xl border border-edge bg-panel-raised/70 p-2 text-highlight">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

function ItemRow({ item }: { item: PlannerItem }) {
  return (
    <li className="group rounded-xl border border-edge/70 bg-panel-raised/35 px-4 py-3 transition-colors hover:border-edge-strong hover:bg-panel-hover/50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-primary">
            {item.title}
          </span>
          <p className="mt-1 text-[11px] leading-5 text-ink-muted">
            {[
              item.topic,
              item.content_type,
              item.series ? `Series: ${item.series}` : null,
              item.target_date ?? "No target date",
              item.target_platforms.length > 0
                ? item.target_platforms
                    .map((platform) => PLATFORM_LABELS[platform])
                    .join(", ")
                : "No platform chosen yet",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {item.priority === "high" ? (
            <StatusBadge tone="accent">
              {PLANNER_PRIORITY_LABELS[item.priority]}
            </StatusBadge>
          ) : null}
          <StatusBadge
            tone={item.status === "in_production" ? "configured" : "inactive"}
          >
            {PLANNER_STATUS_LABELS[item.status]}
          </StatusBadge>
        </span>
      </div>

      {item.notes ? (
        <p className="mt-2 text-xs leading-5 text-ink-secondary">{item.notes}</p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          No planning notes have been added yet.
        </p>
      )}

      {item.content_item_id ? (
        <Link
          href={`/dashboard/content/${item.content_item_id}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          <Link2 className="size-3" aria-hidden="true" />
          Open the linked content item
        </Link>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <Lightbulb className="size-3" aria-hidden="true" />
          Planning intent only — no content item linked yet.
        </p>
      )}
    </li>
  );
}

function ItemList({
  items,
  emptyMessage,
}: {
  items: PlannerItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

export default async function PlannerPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const [items, overview] = await Promise.all([
    listPlannerItems(),
    loadAnalyticsOverview(),
  ]);

  const views = buildPlannerViews(items);
  const recommendations = buildPlannerRecommendations({
    posts: overview.posts,
    measuredCount: overview.measuredCount,
    plannedTopicCounts: openTopicCounts(items),
  });
  const openItems = items.filter((item) =>
    OPEN_PLANNER_STATUSES.includes(item.status),
  );
  const inProduction = items.filter(
    (item) => item.status === "in_production",
  ).length;
  const highPriority = openItems.filter((item) => item.priority === "high").length;
  const linkedContent = openItems.filter((item) => item.content_item_id !== null).length;

  return (
    <DashboardShell
      title="Content Planner"
      pathname="/dashboard/planner"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(77,141,247,0.15),transparent_35%),linear-gradient(135deg,rgba(12,20,42,0.96),rgba(7,11,22,0.96))] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-highlight/30 bg-highlight/10 px-3 py-1 text-xs font-medium text-highlight-soft">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Planning command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Content Planner
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Decide what to make next, why it matters and where it should go.
                Planning stays separate from scheduling, approval and publishing.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/content"
                className="rounded-lg border border-edge-strong bg-panel-raised/70 px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Content Library
              </Link>
              <Link
                href="/dashboard/content/new"
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Create Content
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Open Plans"
            value={openItems.length}
            note="Ideas, planned work and items already in production."
            icon={ClipboardList}
          />
          <Metric
            label="This Week"
            value={views.thisWeek.length}
            note="Open items targeted within the next seven days."
            icon={CalendarClock}
          />
          <Metric
            label="High Priority"
            value={highPriority}
            note="Open planner items currently marked high priority."
            icon={Target}
          />
          <Metric
            label="In Production"
            value={inProduction}
            note="Plan items already linked into active production."
            icon={Rocket}
          />
          <Metric
            label="Linked Content"
            value={linkedContent}
            note="Open plan items connected to actual content records."
            icon={CheckCircle2}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <SectionCard
            title="This week"
            description="Open items with a target date in the next seven days."
          >
            <ItemList
              items={views.thisWeek}
              emptyMessage="Nothing is targeted at this week."
            />
          </SectionCard>

          <SectionCard
            title="Suggested by the evidence"
            description="Recommendations come from measured Growth Centre evidence. If evidence is thin, the planner says so instead of inventing."
          >
            {recommendations.length === 0 ? (
              <p className="text-sm leading-6 text-ink-muted">
                {recommendationAbsenceReason({
                  publishedCount: overview.publishedCount,
                  measuredCount: overview.measuredCount,
                })}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recommendations.map((recommendation, index) => (
                  <li
                    key={`${recommendation.kind}-${index}`}
                    className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-primary">
                        {recommendation.headline}
                      </span>
                      <StatusBadge tone="accent">
                        {CONFIDENCE_LABELS[recommendation.confidence]}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink-secondary">
                      {recommendation.reason}
                    </p>
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                      Evidence: {recommendation.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Upcoming"
            description="Open items targeted beyond this week."
          >
            <ItemList
              items={views.upcoming}
              emptyMessage="Nothing is targeted further out yet."
            />
          </SectionCard>

          <SectionCard
            title="Backlog"
            description="Open items with no target date."
          >
            {views.backlog.length === 0 &&
            views.thisWeek.length === 0 &&
            views.upcoming.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nothing planned yet."
                description="Add the first plan item below. Plans are intent — they become real through the ordinary produce, approve and schedule path."
              />
            ) : (
              <ItemList
                items={views.backlog}
                emptyMessage="The backlog is empty."
              />
            )}
          </SectionCard>
        </div>

        {views.byTopic.size > 0 ? (
          <SectionCard
            title="Topic coverage"
            description="Open intent grouped by the stored topic, so gaps and repetition are easier to see."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...views.byTopic.entries()].map(([topic, topicItems]) => (
                <div
                  key={topic}
                  className="rounded-xl border border-edge/70 bg-panel-raised/30 p-3.5"
                >
                  <h3 className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-ink-secondary">
                    <span>{topic}</span>
                    <span className="text-ink-muted">{topicItems.length}</span>
                  </h3>
                  <ItemList items={topicItems} emptyMessage="" />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Add a plan item"
          description="Record intent here. Producing, approving, scheduling and publishing remain separate steps."
        >
          <PlannerForm />
        </SectionCard>

        {views.closed.length > 0 ? (
          <SectionCard
            title="Done and dropped"
            description="Closed plan items kept as planning history, not publication proof."
          >
            <ItemList items={views.closed} emptyMessage="" />
          </SectionCard>
        ) : null}

        <div className="rounded-2xl border border-edge bg-panel/55 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Planner truth boundary
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            A plan item records intent only. A target date is not a scheduled post,
            a linked content item is not approval, and a completed plan does not
            prove anything was published. Real content must still move through
            production, approval, scheduling and the Publish Queue.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
