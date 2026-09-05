import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  Link2,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  accent = "purple",
}: {
  label: string;
  value: number;
  note: string;
  icon: LucideIcon;
  accent?: "purple" | "gold" | "green" | "neutral";
}) {
  const accents = {
    purple: "border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]",
    gold: "border-gold-dim/35 bg-gold/10 text-gold",
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
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${accents[accent]}`}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{note}</p>
    </div>
  );
}

function ItemRow({ item }: { item: PlannerItem }) {
  return (
    <li className="group relative overflow-hidden rounded-xl border border-edge/70 bg-[#0b1120]/75 px-4 py-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong hover:bg-[#0d1425]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-5 text-ink-primary">
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

      <p className="mt-2 text-xs leading-5 text-ink-secondary">
        {item.notes ?? "No planning notes have been added yet."}
      </p>

      {item.content_item_id ? (
        <Link
          href={`/dashboard/content/${item.content_item_id}`}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-edge-strong bg-white/[0.025] px-3 py-1.5 text-[11px] font-medium text-ink-primary transition hover:bg-white/[0.055] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
        >
          <Link2 className="size-3" aria-hidden="true" />
          Open linked content
          <ArrowUpRight className="size-3" aria-hidden="true" />
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
    return (
      <div className="rounded-xl border border-dashed border-edge/80 px-4 py-6 text-center text-sm text-ink-muted">
        {emptyMessage}
      </div>
    );
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
  const highPriority = openItems.filter(
    (item) => item.priority === "high",
  ).length;
  const linkedContent = openItems.filter(
    (item) => item.content_item_id !== null,
  ).length;
  const withoutDate = views.backlog.length;

  return (
    <DashboardShell
      title="Content Planner"
      pathname="/dashboard/planner"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.25),transparent_34%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.10),transparent_27%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Planning Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Plan the next move before production begins
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Shape ideas, priorities, topics, target dates and platforms in a
                dedicated planning workspace. Planning remains intentionally
                separate from production, approval, scheduling and publishing.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <a
                  href="#add-plan-item"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  <Lightbulb aria-hidden="true" className="size-4" />
                  Add plan item
                </a>
                <Link
                  href="/dashboard/content"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  Content Library
                </Link>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[320px]">
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  This week
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {views.thisWeek.length}
                </p>
              </div>
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Evidence ideas
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {recommendations.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Content planner summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          <Metric
            label="Open plans"
            value={openItems.length}
            note="Ideas, planned work and items already in production."
            icon={ClipboardList}
            accent="purple"
          />
          <Metric
            label="This week"
            value={views.thisWeek.length}
            note="Open items targeted within the next seven days."
            icon={CalendarClock}
            accent="gold"
          />
          <Metric
            label="High priority"
            value={highPriority}
            note="Open planner items currently marked high priority."
            icon={Target}
            accent="gold"
          />
          <Metric
            label="In production"
            value={inProduction}
            note="Plan items that have already reached active production."
            icon={Rocket}
            accent="green"
          />
          <Metric
            label="No target date"
            value={withoutDate}
            note={`${linkedContent} open ${linkedContent === 1 ? "plan is" : "plans are"} linked to content.`}
            icon={CheckCircle2}
            accent="neutral"
          />
        </section>

        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)]">
          <SectionCard
            title="Planning runway"
            description="The work closest to execution, ordered by the target information already stored."
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <section className="rounded-2xl border border-[#7138dc]/20 bg-[#7138dc]/[0.055] p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#bda7ff]">
                      Now
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-ink-primary">
                      This week
                    </h3>
                  </div>
                  <span className="flex size-8 items-center justify-center rounded-full border border-[#7138dc]/25 bg-[#7138dc]/10 text-xs font-semibold text-[#bda7ff]">
                    {views.thisWeek.length}
                  </span>
                </div>
                <ItemList
                  items={views.thisWeek}
                  emptyMessage="Nothing is targeted at this week."
                />
              </section>

              <section className="rounded-2xl border border-edge/75 bg-[#0a0f1d]/65 p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                      Next
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-ink-primary">
                      Upcoming
                    </h3>
                  </div>
                  <span className="flex size-8 items-center justify-center rounded-full border border-gold-dim/35 bg-gold/10 text-xs font-semibold text-gold">
                    {views.upcoming.length}
                  </span>
                </div>
                <ItemList
                  items={views.upcoming}
                  emptyMessage="Nothing is targeted further out yet."
                />
              </section>

              <section className="rounded-2xl border border-edge/75 bg-[#0a0f1d]/65 p-3.5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Later
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-ink-primary">
                      Backlog
                    </h3>
                  </div>
                  <span className="flex size-8 items-center justify-center rounded-full border border-edge bg-white/[0.025] text-xs font-semibold text-ink-secondary">
                    {views.backlog.length}
                  </span>
                </div>
                {views.backlog.length === 0 &&
                views.thisWeek.length === 0 &&
                views.upcoming.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Nothing planned yet."
                    description="Add the first plan item below. Plans become real only through the normal production workflow."
                  />
                ) : (
                  <ItemList
                    items={views.backlog}
                    emptyMessage="The backlog is empty."
                  />
                )}
              </section>
            </div>
          </SectionCard>

          <SectionCard
            title="Suggested by the evidence"
            description="Recommendations come from measured Growth Centre evidence. Thin evidence stays visibly thin."
          >
            {recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-edge px-4 py-6">
                <Lightbulb
                  aria-hidden="true"
                  className="size-5 text-ink-muted"
                />
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {recommendationAbsenceReason({
                    publishedCount: overview.publishedCount,
                    measuredCount: overview.measuredCount,
                  })}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {recommendations.map((recommendation, index) => (
                  <li
                    key={`${recommendation.kind}-${index}`}
                    className="rounded-xl border border-gold-dim/25 bg-gold/[0.035] px-4 py-3.5"
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
                    <p className="mt-2 border-t border-edge/60 pt-2 text-[11px] leading-5 text-ink-muted">
                      Evidence: {recommendation.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {views.byTopic.size > 0 ? (
          <SectionCard
            title="Topic coverage"
            description="Open intent grouped by stored topic so repetition and gaps are visible before more content is commissioned."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...views.byTopic.entries()].map(([topic, topicItems]) => (
                <div
                  key={topic}
                  className="rounded-2xl border border-edge/75 bg-[#0a0f1d]/65 p-3.5"
                >
                  <h3 className="mb-3 flex items-center justify-between gap-2 text-xs font-semibold text-ink-secondary">
                    <span>{topic}</span>
                    <span className="flex size-7 items-center justify-center rounded-full border border-edge bg-white/[0.025] text-ink-muted">
                      {topicItems.length}
                    </span>
                  </h3>
                  <ItemList items={topicItems} emptyMessage="" />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <div id="add-plan-item">
          <SectionCard
            title="Add a plan item"
            description="Capture the idea, priority, topic and target intent here. This form does not approve, schedule or publish anything."
          >
            <div className="mb-4 rounded-xl border border-[#7138dc]/20 bg-[#7138dc]/[0.055] px-4 py-3 text-xs leading-5 text-ink-secondary">
              Use the planner for intent and prioritisation. When the idea becomes
              real content, it continues through the ordinary Scripture,
              production, review, approval and publishing controls.
            </div>
            <PlannerForm />
          </SectionCard>
        </div>

        {views.closed.length > 0 ? (
          <SectionCard
            title="Done and dropped"
            description="Closed plan items remain as planning history, not proof that anything was published."
          >
            <ItemList items={views.closed} emptyMessage="" />
          </SectionCard>
        ) : null}

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <CheckCircle2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Planner truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                A plan records intent only. A target date is not a scheduled
                post, linked content is not approval, and a completed plan does
                not prove publication. Real content must still pass through
                production, approval, scheduling and the Publish Queue.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
