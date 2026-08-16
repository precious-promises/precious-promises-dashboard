import { ClipboardList } from "lucide-react";
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

/**
 * The Content Planner: an operational planning workspace.
 *
 * Planning is intent. Nothing here schedules, approves or publishes, and the
 * data-driven suggestions carry their evidence or do not appear at all.
 */

function ItemRow({ item }: { item: PlannerItem }) {
  return (
    <li className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-sm font-medium text-ink-primary">
          {item.title}
        </span>
        <span className="flex items-center gap-2">
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

      <p className="mt-1 text-[11px] text-ink-muted">
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

      {item.notes ? (
        <p className="mt-1 text-xs leading-5 text-ink-secondary">
          {item.notes}
        </p>
      ) : null}

      {item.content_item_id ? (
        <Link
          href={`/dashboard/content/${item.content_item_id}`}
          className="mt-2 inline-flex items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          Open the linked content item
        </Link>
      ) : null}
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
    <ul className="flex flex-col gap-2">
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

  return (
    <DashboardShell
      title="Content Planner"
      pathname="/dashboard/planner"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Content Planner
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            What to make next, and why. Planning is separate from scheduling — a
            plan item never sends anything anywhere.
          </p>
        </div>

        <SectionCard
          title="Suggested by the evidence"
          description="Built from the Growth Centre's findings. Every suggestion carries its evidence; when the evidence is thin, this section says so instead of inventing."
        >
          {recommendations.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {recommendationAbsenceReason({
                publishedCount: overview.publishedCount,
                measuredCount: overview.measuredCount,
              })}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recommendations.map((recommendation, index) => (
                <li
                  key={`${recommendation.kind}-${index}`}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
                      {recommendation.headline}
                    </span>
                    <StatusBadge tone="accent">
                      {CONFIDENCE_LABELS[recommendation.confidence]}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    {recommendation.reason}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                    Evidence: {recommendation.evidence}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

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

        {views.byTopic.size > 0 ? (
          <SectionCard
            title="By topic"
            description="Open items grouped by their stored topic."
          >
            <div className="flex flex-col gap-4">
              {[...views.byTopic.entries()].map(([topic, topicItems]) => (
                <div key={topic}>
                  <h3 className="mb-1.5 text-xs font-medium text-ink-secondary">
                    {topic} ({topicItems.length})
                  </h3>
                  <ItemList items={topicItems} emptyMessage="" />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Add a plan item"
          description="Intent only. Producing, approving and scheduling remain their own steps."
        >
          <PlannerForm />
        </SectionCard>

        {views.closed.length > 0 ? (
          <SectionCard
            title="Done and dropped"
            description="Closed plan items, kept for the record."
          >
            <ItemList items={views.closed} emptyMessage="" />
          </SectionCard>
        ) : null}
      </div>
    </DashboardShell>
  );
}
