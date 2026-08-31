import {
  ArrowUpRight,
  BarChart3,
  FlaskConical,
  Goal,
  Lightbulb,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  ConcludeExperimentForm,
  ExperimentForm,
} from "@/components/growth/experiment-form";
import { GoalForm } from "@/components/growth/goal-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import { METRIC_LABELS } from "@/lib/analytics/types";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  analyseGrouping,
  byDurationBand,
  byTimeBand,
  byTitleStyle,
  byTopic,
  byWeekday,
  findWinners,
  isWinner,
  type GroupFinding,
} from "@/lib/growth/analysis";
import {
  CONFIDENCE_DETAIL,
  CONFIDENCE_LABELS,
  type ConfidenceLevel,
} from "@/lib/growth/confidence";
import {
  EXPERIMENT_DIMENSION_LABELS,
  EXPERIMENT_STATUS_DETAIL,
  EXPERIMENT_STATUS_LABELS,
  experimentReadiness,
  OBSERVATIONAL_NOTE,
} from "@/lib/growth/experiments";
import {
  describeProgress,
  GOAL_METRIC_LABELS,
  GOAL_STATUS_LABELS,
  measureGoal,
} from "@/lib/growth/goals";
import { buildWeeklyMission, missionAbsenceReason } from "@/lib/growth/mission";
import {
  findMissingPlatformCandidates,
  findShortsCandidates,
  REPURPOSE_KIND_LABELS,
} from "@/lib/growth/repurpose";
import {
  loadExperimentPosts,
  loadExperiments,
  loadGoals,
} from "@/lib/growth/repository";
import { DEFAULT_TIMEZONE } from "@/lib/schedule/timezone";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLATFORM_LABELS } from "@/lib/variants/types";

export const metadata: Metadata = {
  title: "Growth Centre · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * The Growth Centre.
 *
 * **An evidence surface, not an oracle.** Everything here is derived from
 * posts that genuinely went out and figures a platform genuinely reported, and
 * every finding carries how much evidence sits behind it.
 *
 * Where there is not enough evidence, this page says so and stops. It does not
 * fill the space with a plausible recommendation — a growth tool that invents
 * advice from three data points teaches its owner to ignore it, and the real
 * finding, when it comes, arrives to an audience that has stopped listening.
 */

const CONFIDENCE_TONES: Record<
  ConfidenceLevel,
  "configured" | "accent" | "inactive"
> = {
  strong_pattern: "configured",
  moderate_evidence: "accent",
  early_signal: "accent",
  insufficient_data: "inactive",
};

function FindingList({
  findings,
  emptyMessage,
}: {
  findings: GroupFinding[];
  emptyMessage: string;
}) {
  const worthShowing = findings.filter(
    (finding) => finding.confidence.level !== "insufficient_data",
  );

  if (worthShowing.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {worthShowing.map((finding) => (
        <li
          key={`${finding.groupKey}-${finding.groupLabel}`}
          className="rounded-xl border border-edge/70 bg-panel-raised/45 px-4 py-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-sm font-semibold text-ink-primary">
              {finding.groupLabel}
            </span>
            <StatusBadge tone={CONFIDENCE_TONES[finding.confidence.level]}>
              {CONFIDENCE_LABELS[finding.confidence.level]}
            </StatusBadge>
          </div>

          <p className="mt-1.5 text-xs leading-5 text-ink-secondary">
            {finding.headline}
          </p>

          <p className="mt-1 text-[11px] leading-5 text-ink-muted">
            {finding.measuredCount} of {finding.postCount} comparable posts
            measured. {finding.confidence.reasons.join(" ")}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function GrowthCentrePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const overview = await loadAnalyticsOverview();
  const posts = overview.posts;

  const topicFindings = analyseGrouping({
    posts,
    metric: "views_or_plays",
    groupBy: byTopic,
  });
  const durationFindings = analyseGrouping({
    posts,
    metric: "views_or_plays",
    groupBy: byDurationBand,
  });
  const weekdayFindings = analyseGrouping({
    posts,
    metric: "views_or_plays",
    groupBy: byWeekday(DEFAULT_TIMEZONE),
  });
  const timeFindings = analyseGrouping({
    posts,
    metric: "views_or_plays",
    groupBy: byTimeBand(DEFAULT_TIMEZONE),
  });
  const titleFindings = analyseGrouping({
    posts,
    metric: "views_or_plays",
    groupBy: byTitleStyle,
  });

  const winners = findWinners({ posts, metric: "views_or_plays", limit: 8 });
  const standouts = winners.filter(isWinner);

  const repurpose = [
    ...findMissingPlatformCandidates({ winners, allPosts: posts }),
    ...findShortsCandidates(posts),
  ].slice(0, 8);

  const missionInputs = {
    findings: [
      ...topicFindings,
      ...durationFindings,
      ...weekdayFindings,
      ...timeFindings,
      ...titleFindings,
    ],
    repurposeCandidates: repurpose,
    publishedCount: overview.publishedCount,
    measuredCount: overview.measuredCount,
  };

  const mission = buildWeeklyMission(missionInputs);

  const goals = await loadGoals();
  const experiments = await loadExperiments();
  const experimentPosts = await loadExperimentPosts(
    experiments.map((experiment) => experiment.id),
  );

  // Progress is measured against real observations. A goal whose metric has
  // never been read shows as unmeasured, never as 0%.
  const goalProgress = goals.map((goal) =>
    measureGoal(
      goal,
      overview.totals[goal.metric as keyof typeof overview.totals] ?? {
        available: false as const,
        metric: goal.metric as never,
        reason: "not_yet_fetched" as const,
      },
    ),
  );

  const comparablePlatforms = new Set(posts.map((post) => post.platform)).size;
  const evidenceCoverage =
    overview.publishedCount > 0
      ? Math.round((overview.measuredCount / overview.publishedCount) * 100)
      : null;

  return (
    <DashboardShell
      title="Growth Centre"
      pathname="/dashboard/growth"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-edge bg-gradient-to-br from-panel-raised via-panel to-panel-raised/70 p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-highlight/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-highlight/25 bg-highlight/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-highlight">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                Evidence-led growth
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Turn measured performance into the next useful decision.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
                Growth Centre compares only real published work with real
                platform observations. It surfaces patterns when the evidence
                supports them and stays silent when it does not.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/analytics"
                className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-panel-raised px-4 py-2.5 text-xs font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Open analytics
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard/content"
                className="inline-flex items-center gap-2 rounded-xl border border-highlight/30 bg-highlight/10 px-4 py-2.5 text-xs font-semibold text-highlight transition-colors hover:bg-highlight/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Content library
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <dl className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-edge/80 bg-panel/70 p-4 backdrop-blur-sm">
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Published evidence
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink-primary">
                {overview.publishedCount}
              </dd>
              <p className="mt-1 text-[11px] text-ink-muted">
                Posts recorded as genuinely published
              </p>
            </div>
            <div className="rounded-2xl border border-edge/80 bg-panel/70 p-4 backdrop-blur-sm">
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Measured evidence
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink-primary">
                {overview.measuredCount}
              </dd>
              <p className="mt-1 text-[11px] text-ink-muted">
                Platform observations available for analysis
              </p>
            </div>
            <div className="rounded-2xl border border-edge/80 bg-panel/70 p-4 backdrop-blur-sm">
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Evidence coverage
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink-primary">
                {evidenceCoverage === null ? "—" : `${evidenceCoverage}%`}
              </dd>
              <p className="mt-1 text-[11px] text-ink-muted">
                Measured share of published posts
              </p>
            </div>
            <div className="rounded-2xl border border-edge/80 bg-panel/70 p-4 backdrop-blur-sm">
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
                Current standouts
              </dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink-primary">
                {standouts.length}
              </dd>
              <p className="mt-1 text-[11px] text-ink-muted">
                Only after valid comparison-set ranking
              </p>
            </div>
          </dl>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              step: "01",
              icon: BarChart3,
              title: "Observe",
              detail: "Use only metrics the platform actually returned.",
            },
            {
              step: "02",
              icon: Target,
              title: "Compare",
              detail: "Rank like with like inside defensible comparison sets.",
            },
            {
              step: "03",
              icon: FlaskConical,
              title: "Qualify",
              detail: "Attach confidence and suppress insufficient evidence.",
            },
            {
              step: "04",
              icon: Lightbulb,
              title: "Act",
              detail: "Turn evidence into planning, never invented outcomes.",
            },
          ].map(({ step, icon: Icon, title, detail }) => (
            <div
              key={step}
              className="rounded-2xl border border-edge/80 bg-panel-raised/45 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold tracking-[0.16em] text-ink-muted">
                  {step}
                </span>
                <Icon className="h-4 w-4 text-highlight" aria-hidden="true" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink-primary">
                {title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
            </div>
          ))}
        </section>

        <SectionCard
          title="This week"
          description="One evidence-derived action. If the evidence is not strong enough, no mission is manufactured."
        >
          {mission === null ? (
            <EmptyState
              icon={Sparkles}
              title="No mission yet."
              description={missionAbsenceReason(missionInputs)}
            />
          ) : (
            <div className="rounded-2xl border border-highlight/20 bg-highlight/5 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {mission.headline}
                </h3>
                <StatusBadge tone={CONFIDENCE_TONES[mission.confidence]}>
                  {CONFIDENCE_LABELS[mission.confidence]}
                </StatusBadge>
              </div>

              <p className="mt-2 text-sm text-ink-secondary">
                {mission.action}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-ink-muted">
                {mission.rationale}
              </p>

              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[11px] leading-5 text-ink-muted">
                {mission.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Data quality"
          description="Read the evidence base before acting on any pattern below."
        >
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
              <dt className="text-xs text-ink-muted">Published posts</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {overview.publishedCount}
              </dd>
            </div>
            <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
              <dt className="text-xs text-ink-muted">Measured posts</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {overview.measuredCount}
              </dd>
            </div>
            <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
              <dt className="text-xs text-ink-muted">Comparable platforms</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {comparablePlatforms}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Findings are only shown within a comparison set — same platform,
            similar length. A two-hour teaching and a thirty-second Short are
            never ranked against each other, because the comparison would
            describe the format rather than the content.
          </p>

          <ul className="mt-3 grid gap-2 text-[11px] leading-5 text-ink-muted sm:grid-cols-2">
            {(
              [
                "strong_pattern",
                "moderate_evidence",
                "early_signal",
                "insufficient_data",
              ] as ConfidenceLevel[]
            ).map((level) => (
              <li
                key={level}
                className="rounded-lg border border-edge/60 bg-panel/45 px-3 py-2"
              >
                <span className="font-medium text-ink-secondary">
                  {CONFIDENCE_LABELS[level]}
                </span>{" "}
                — {CONFIDENCE_DETAIL[level]}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Winning content"
          description={`Ranked by percentile within its own comparison set, using ${METRIC_LABELS.views_or_plays.toLowerCase()}. No composite score — a single opaque number would be unarguable.`}
        >
          {standouts.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No standouts yet. A winner needs at least three comparable posts
              to be ranked against; below that, calling one the best would be
              picking rather than measuring.
            </p>
          ) : (
            <ul className="grid gap-2 lg:grid-cols-2">
              {standouts.map((winner) => (
                <li
                  key={winner.post.scheduledPostId}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-primary">
                      {winner.post.title ?? "Untitled"}
                    </span>
                    <StatusBadge tone="configured">
                      Top {Math.max(1, Math.round(100 - winner.percentile))}%
                    </StatusBadge>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                    {winner.comparisonLabel} · ranked against{" "}
                    {winner.comparedAgainst} comparable posts ·{" "}
                    {Math.round(winner.value).toLocaleString("en-GB")}{" "}
                    {METRIC_LABELS[winner.metric].toLowerCase()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Topics"
            description="Grouped only by the topic already stored on each content item."
          >
            <FindingList
              findings={topicFindings}
              emptyMessage="No topic has enough comparable measured posts yet to say anything about it."
            />
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              Nothing here classifies Scripture or infers a topic from verse
              text.
            </p>
          </SectionCard>

          <SectionCard
            title="Length"
            description="Format bands derived from the content this product actually makes."
          >
            <FindingList
              findings={durationFindings}
              emptyMessage="Not enough measured posts across different lengths to compare them."
            />
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              No claim is made about what a platform algorithm prefers.
            </p>
          </SectionCard>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Posting time"
            description={`Weekday and local time band in ${DEFAULT_TIMEZONE}. Stored UTC instants are converted before comparison.`}
          >
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-ink-secondary">
                  Weekday
                </h3>
                <FindingList
                  findings={weekdayFindings}
                  emptyMessage="Not enough measured posts across different days to compare them."
                />
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-medium text-ink-secondary">
                  Time of day
                </h3>
                <FindingList
                  findings={timeFindings}
                  emptyMessage="Not enough measured posts across different times to compare them."
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Titles"
            description="Only deterministic title properties are compared."
          >
            <FindingList
              findings={titleFindings}
              emptyMessage="Not enough measured posts with titles to compare styles."
            />
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              Question marks, Scripture references and title length can be
              measured. No model judges whether a hook is good.
            </p>
          </SectionCard>
        </div>

        <SectionCard
          title="Goals"
          description="Targets you set. Never predictions, and never plotted as observations."
        >
          <div className="mb-4 flex items-center gap-2 text-xs text-ink-muted">
            <Goal className="h-4 w-4 text-highlight" aria-hidden="true" />
            Target state stays separate from observed state.
          </div>

          {goalProgress.length > 0 ? (
            <ul className="mb-5 grid gap-2 lg:grid-cols-2">
              {goalProgress.map((progress) => (
                <li
                  key={progress.goal.id}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-primary">
                      {progress.goal.name}
                    </span>
                    <StatusBadge
                      tone={
                        progress.goal.status === "achieved"
                          ? "configured"
                          : "inactive"
                      }
                    >
                      {GOAL_STATUS_LABELS[progress.goal.status]}
                    </StatusBadge>
                  </div>

                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {GOAL_METRIC_LABELS[progress.goal.metric]} ·{" "}
                    {Number(progress.goal.target_value).toLocaleString("en-GB")}{" "}
                    by {progress.goal.period_end}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    {describeProgress(progress)}
                  </p>

                  {progress.percent !== null ? (
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel"
                      role="img"
                      aria-label={`${Math.round(progress.percent)}% of target measured`}
                    >
                      <div
                        className="h-full rounded-full bg-highlight"
                        style={{
                          width: `${Math.min(100, Math.max(0, progress.percent))}%`,
                        }}
                      />
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-gold">
                      Not measured yet — this is not the same as no progress.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          <GoalForm />
        </SectionCard>

        <SectionCard
          title="Experiments"
          description="Observational by design: these platforms do not provide randomised simultaneous assignment here."
        >
          <div className="mb-4 flex items-center gap-2 text-xs text-ink-muted">
            <FlaskConical
              className="h-4 w-4 text-highlight"
              aria-hidden="true"
            />
            No result is declared automatically.
          </div>

          {experiments.length > 0 ? (
            <ul className="mb-5 grid gap-2 lg:grid-cols-2">
              {experiments.map((experiment) => {
                const experimentEntries =
                  experimentPosts.get(experiment.id) ?? [];
                const perArm = new Map<string, number>();
                for (const entry of experimentEntries) {
                  perArm.set(entry.arm, (perArm.get(entry.arm) ?? 0) + 1);
                }

                const readiness = experimentReadiness({
                  postsPerArm: perArm,
                  status: experiment.status,
                });

                return (
                  <li
                    key={experiment.id}
                    className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-ink-primary">
                        {experiment.name}
                      </span>
                      <StatusBadge
                        tone={
                          experiment.status === "observed"
                            ? "configured"
                            : "inactive"
                        }
                      >
                        {EXPERIMENT_STATUS_LABELS[experiment.status]}
                      </StatusBadge>
                    </div>

                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {EXPERIMENT_DIMENSION_LABELS[experiment.dimension]} ·{" "}
                      {EXPERIMENT_STATUS_DETAIL[experiment.status]}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-ink-secondary">
                      {experiment.hypothesis}
                    </p>

                    {experiment.observation ? (
                      <p className="mt-1.5 rounded-lg border border-edge/60 bg-panel/50 px-2.5 py-1.5 text-[11px] leading-5 text-ink-secondary">
                        {experiment.observation}
                      </p>
                    ) : null}

                    {experiment.status === "planned" ||
                    experiment.status === "running" ? (
                      <ConcludeExperimentForm
                        experimentId={experiment.id}
                        canConclude={readiness.canConclude}
                        readinessReason={readiness.reason}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <ExperimentForm />

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            {OBSERVATIONAL_NOTE}
          </p>
        </SectionCard>

        <SectionCard
          title="Repurpose"
          description="Planning suggestions only. Nothing here creates a variant, schedules a post or touches an approval."
        >
          {repurpose.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No repurpose candidates. These come from content that has already
              performed well enough to be ranked, so they appear once there is
              enough measured work to rank.
            </p>
          ) : (
            <ul className="grid gap-2 lg:grid-cols-2">
              {repurpose.map((candidate, index) => (
                <li
                  key={`${candidate.kind}-${candidate.contentItemId ?? index}-${candidate.suggestedPlatform ?? "none"}`}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-primary">
                      {candidate.title}
                    </span>
                    <StatusBadge tone={CONFIDENCE_TONES[candidate.confidence]}>
                      {CONFIDENCE_LABELS[candidate.confidence]}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {REPURPOSE_KIND_LABELS[candidate.kind]}
                    {candidate.suggestedPlatform
                      ? ` · suggested for ${PLATFORM_LABELS[candidate.suggestedPlatform]}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    {candidate.reason}
                  </p>
                  {candidate.contentItemId ? (
                    <Link
                      href={`/dashboard/content/${candidate.contentItemId}`}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                    >
                      Open original to plan
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            A suggestion is a planning action. Producing, approving and
            scheduling remain exactly as they were, with human approval
            mandatory before anything is published.
          </p>
        </SectionCard>

        <section className="rounded-2xl border border-gold/20 bg-gold/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <Target
              className="mt-0.5 h-4 w-4 shrink-0 text-gold"
              aria-hidden="true"
            />
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">
                Growth truth boundary
              </h3>
              <p className="mt-2 text-xs leading-5 text-ink-secondary">
                Published ≠ measured. Measured ≠ causal. Pattern ≠ prediction.
                Suggestion ≠ performance outcome. Goal ≠ observation. An
                experiment here is observational, not a randomised trial.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
