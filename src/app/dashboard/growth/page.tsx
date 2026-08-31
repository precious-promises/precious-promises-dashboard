import {
  BarChart3,
  Beaker,
  Target,
  Lightbulb,
  Repeat2,
  ShieldCheck,
  Sparkles,
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

const CONFIDENCE_TONES: Record<ConfidenceLevel, "configured" | "accent" | "inactive"> = {
  strong_pattern: "configured",
  moderate_evidence: "accent",
  early_signal: "accent",
  insufficient_data: "inactive",
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

function FindingList({ findings, emptyMessage }: { findings: GroupFinding[]; emptyMessage: string }) {
  const worthShowing = findings.filter((finding) => finding.confidence.level !== "insufficient_data");
  if (worthShowing.length === 0) return <p className="text-sm text-ink-muted">{emptyMessage}</p>;

  return (
    <ul className="grid gap-3 xl:grid-cols-2">
      {worthShowing.map((finding) => (
        <li key={`${finding.groupKey}-${finding.groupLabel}`} className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-sm font-semibold text-ink-primary">{finding.groupLabel}</span>
            <StatusBadge tone={CONFIDENCE_TONES[finding.confidence.level]}>{CONFIDENCE_LABELS[finding.confidence.level]}</StatusBadge>
          </div>
          <p className="mt-2 text-xs leading-5 text-ink-secondary">{finding.headline}</p>
          <p className="mt-2 text-[11px] leading-5 text-ink-muted">{finding.measuredCount} of {finding.postCount} comparable posts measured. {finding.confidence.reasons.join(" ")}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function GrowthCentrePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(LOGIN_PATH);

  const overview = await loadAnalyticsOverview();
  const posts = overview.posts;
  const topicFindings = analyseGrouping({ posts, metric: "views_or_plays", groupBy: byTopic });
  const durationFindings = analyseGrouping({ posts, metric: "views_or_plays", groupBy: byDurationBand });
  const weekdayFindings = analyseGrouping({ posts, metric: "views_or_plays", groupBy: byWeekday(DEFAULT_TIMEZONE) });
  const timeFindings = analyseGrouping({ posts, metric: "views_or_plays", groupBy: byTimeBand(DEFAULT_TIMEZONE) });
  const titleFindings = analyseGrouping({ posts, metric: "views_or_plays", groupBy: byTitleStyle });

  const winners = findWinners({ posts, metric: "views_or_plays", limit: 8 });
  const standouts = winners.filter(isWinner);
  const repurpose = [...findMissingPlatformCandidates({ winners, allPosts: posts }), ...findShortsCandidates(posts)].slice(0, 8);
  const allFindings = [...topicFindings, ...durationFindings, ...weekdayFindings, ...timeFindings, ...titleFindings];
  const supportedFindings = allFindings.filter((finding) => finding.confidence.level !== "insufficient_data");

  const missionInputs = { findings: allFindings, repurposeCandidates: repurpose, publishedCount: overview.publishedCount, measuredCount: overview.measuredCount };
  const mission = buildWeeklyMission(missionInputs);

  const goals = await loadGoals();
  const experiments = await loadExperiments();
  const experimentPosts = await loadExperimentPosts(experiments.map((experiment) => experiment.id));
  const goalProgress = goals.map((goal) => measureGoal(goal, overview.totals[goal.metric as keyof typeof overview.totals] ?? { available: false as const, metric: goal.metric as never, reason: "not_yet_fetched" as const }));

  return (
    <DashboardShell title="Growth Centre" pathname="/dashboard/growth" email={user.email ?? null}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft"><TrendingUp aria-hidden="true" className="size-4" />Evidence-led growth</div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Growth Centre</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">Turn genuine publishing outcomes into cautious next actions. Every ranking, pattern and mission comes from recorded posts and platform-reported measurements, with confidence shown beside the claim rather than hidden behind a growth score.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/analytics" className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">Open Analytics</Link>
              <Link href="/dashboard/planner" className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">Content Planner</Link>
            </div>
          </div>
        </section>

        <section aria-label="Growth evidence metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Published" value={overview.publishedCount} detail="Posts recorded as genuinely published" />
          <Metric label="Measured" value={overview.measuredCount} detail="Published posts with platform observations" />
          <Metric label="Patterns" value={supportedFindings.length} detail="Findings above insufficient-data level" />
          <Metric label="Standouts" value={standouts.length} detail="Ranked within comparable peer sets" />
          <Metric label="Repurpose" value={repurpose.length} detail="Planning candidates, not created posts" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">This week</p><h3 className="mt-2 text-lg font-semibold text-ink-primary">One evidence-backed action</h3></div>
              <StatusBadge tone={mission ? "configured" : "inactive"}>{mission ? "Evidence available" : "Waiting for evidence"}</StatusBadge>
            </div>
            <div className="mt-5">
              {mission === null ? <EmptyState icon={Sparkles} title="No mission yet." description={missionAbsenceReason(missionInputs)} /> : (
                <div className="rounded-xl border border-edge bg-panel/40 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-base font-semibold text-ink-primary">{mission.headline}</h4><StatusBadge tone={CONFIDENCE_TONES[mission.confidence]}>{CONFIDENCE_LABELS[mission.confidence]}</StatusBadge></div>
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">{mission.action}</p>
                  <p className="mt-2 text-xs leading-5 text-ink-muted">{mission.rationale}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[11px] leading-5 text-ink-muted">{mission.evidence.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary"><ShieldCheck aria-hidden="true" className="size-4 text-ink-muted" />Growth truth boundary</div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted"><li>Published record ≠ measured performance.</li><li>Observed pattern ≠ proven cause.</li><li>Recommendation ≠ predicted outcome.</li><li>Repurpose candidate ≠ created or scheduled content.</li><li>Experiment observation ≠ randomised causal proof.</li></ul>
          </div>
        </section>

        <SectionCard title="Evidence quality" description="How much support exists before the dashboard makes a growth statement.">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.6fr)]">
            <div>
              <p className="text-sm leading-6 text-ink-secondary">Findings are only shown within comparison sets that keep platform and content shape sufficiently alike. A long teaching and a thirty-second Short are not treated as interchangeable evidence.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"><p className="text-xs text-ink-muted">Published posts</p><p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">{overview.publishedCount}</p></div>
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"><p className="text-xs text-ink-muted">Measured posts</p><p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">{overview.measuredCount}</p></div>
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"><p className="text-xs text-ink-muted">Platforms present</p><p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">{new Set(posts.map((post) => post.platform)).size}</p></div>
              </div>
            </div>
            <div className="rounded-xl border border-edge/70 bg-panel/35 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Confidence ladder</p>
              <ul className="mt-3 flex flex-col gap-2 text-[11px] leading-5 text-ink-muted">{(["strong_pattern", "moderate_evidence", "early_signal", "insufficient_data"] as ConfidenceLevel[]).map((level) => <li key={level}><span className="font-semibold text-ink-secondary">{CONFIDENCE_LABELS[level]}</span>{" "}— {CONFIDENCE_DETAIL[level]}</li>)}</ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Winning content" description={`Ranked by percentile inside its own comparison set using ${METRIC_LABELS.views_or_plays.toLowerCase()}. No synthetic or composite growth score is created.`}>
          {standouts.length === 0 ? <EmptyState icon={BarChart3} title="No ranked standouts yet." description="A winner needs enough comparable measured posts to support a ranking. Until then, the dashboard leaves this empty rather than choosing one." /> : (
            <ul className="grid gap-3 xl:grid-cols-2">{standouts.map((winner) => <li key={winner.post.scheduledPostId} className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><span className="text-sm font-semibold text-ink-primary">{winner.post.title ?? "Untitled"}</span><StatusBadge tone="configured">Top {Math.max(1, Math.round(100 - winner.percentile))}%</StatusBadge></div><p className="mt-2 text-[11px] leading-5 text-ink-muted">{winner.comparisonLabel} · ranked against {winner.comparedAgainst} comparable posts · {Math.round(winner.value).toLocaleString("en-GB")} {METRIC_LABELS[winner.metric].toLowerCase()}</p></li>)}</ul>
          )}
        </SectionCard>

        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Topics" description="Uses the topic already stored on each content item. It does not classify Scripture or infer a topic from verse text."><FindingList findings={topicFindings} emptyMessage="No topic has enough comparable measured posts yet to support a finding." /></SectionCard>
          <SectionCard title="Length" description="Compares existing duration bands without claiming that a platform algorithm prefers a format."><FindingList findings={durationFindings} emptyMessage="Not enough measured posts across different lengths to support a comparison." /></SectionCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Posting time" description={`Weekday and local time in ${DEFAULT_TIMEZONE}. Stored UTC instants are converted for analysis.`}>
            <div className="flex flex-col gap-5"><div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Weekday</h3><FindingList findings={weekdayFindings} emptyMessage="Not enough measured posts across different days to support a comparison." /></div><div><h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Time of day</h3><FindingList findings={timeFindings} emptyMessage="Not enough measured posts across different times to support a comparison." /></div></div>
          </SectionCard>
          <SectionCard title="Title patterns" description="Uses deterministic title properties only. No model decides whether a hook is good, viral or persuasive."><FindingList findings={titleFindings} emptyMessage="Not enough measured titled posts to support a comparison." /></SectionCard>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Goals" description="Owner-set targets measured against available observations. Targets are not forecasts.">
            <div className="mb-4 flex items-center gap-2 text-xs text-ink-muted"><Target aria-hidden="true" className="size-4" />Goal progress uses real observations when the metric is available.</div>
            {goalProgress.length > 0 ? <ul className="mb-5 flex flex-col gap-3">{goalProgress.map((progress) => <li key={progress.goal.id} className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><span className="text-sm font-semibold text-ink-primary">{progress.goal.name}</span><StatusBadge tone={progress.goal.status === "achieved" ? "configured" : "inactive"}>{GOAL_STATUS_LABELS[progress.goal.status]}</StatusBadge></div><p className="mt-1 text-[11px] text-ink-muted">{GOAL_METRIC_LABELS[progress.goal.metric]} · {Number(progress.goal.target_value).toLocaleString("en-GB")} by {progress.goal.period_end}</p><p className="mt-2 text-xs leading-5 text-ink-secondary">{describeProgress(progress)}</p>{progress.percent !== null ? <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel" role="img" aria-label={`${Math.round(progress.percent)}% of target measured`}><div className="h-full rounded-full bg-highlight" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} /></div> : <p className="mt-2 text-[11px] text-gold">Not measured yet — this is not the same as no progress.</p>}</li>)}</ul> : null}
            <GoalForm />
          </SectionCard>

          <SectionCard title="Experiments" description="Observational tests only. The dashboard never upgrades an observation into causal proof.">
            <div className="mb-4 flex items-center gap-2 text-xs text-ink-muted"><Beaker aria-hidden="true" className="size-4" />Conclusions stay human-authored and readiness-gated.</div>
            {experiments.length > 0 ? <ul className="mb-5 flex flex-col gap-3">{experiments.map((experiment) => {
              const entries = experimentPosts.get(experiment.id) ?? [];
              const perArm = new Map<string, number>();
              for (const entry of entries) perArm.set(entry.arm, (perArm.get(entry.arm) ?? 0) + 1);
              const readiness = experimentReadiness({ postsPerArm: perArm, status: experiment.status });
              return <li key={experiment.id} className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><span className="text-sm font-semibold text-ink-primary">{experiment.name}</span><StatusBadge tone={experiment.status === "observed" ? "configured" : "inactive"}>{EXPERIMENT_STATUS_LABELS[experiment.status]}</StatusBadge></div><p className="mt-1 text-[11px] text-ink-muted">{EXPERIMENT_DIMENSION_LABELS[experiment.dimension]} · {EXPERIMENT_STATUS_DETAIL[experiment.status]}</p><p className="mt-2 text-xs leading-5 text-ink-secondary">{experiment.hypothesis}</p>{experiment.observation ? <p className="mt-2 rounded-lg border border-edge/60 bg-panel/50 px-3 py-2 text-[11px] leading-5 text-ink-secondary">{experiment.observation}</p> : null}{experiment.status === "planned" || experiment.status === "running" ? <ConcludeExperimentForm experimentId={experiment.id} canConclude={readiness.canConclude} readinessReason={readiness.reason} /> : null}</li>;
            })}</ul> : null}
            <ExperimentForm />
            <p className="mt-3 text-xs leading-5 text-ink-muted">{OBSERVATIONAL_NOTE}</p>
          </SectionCard>
        </section>

        <SectionCard title="Repurpose" description="Evidence-informed planning suggestions only. Nothing here creates a variant, schedules a post, changes approval or publishes content.">
          <div className="mb-4 flex items-center gap-2 text-xs text-ink-muted"><Repeat2 aria-hidden="true" className="size-4" />Candidates appear only after enough measured work exists to rank or compare.</div>
          {repurpose.length === 0 ? <EmptyState icon={Lightbulb} title="No repurpose candidates yet." description="Candidates require evidence from already-published work. The Growth Centre does not create speculative opportunities to fill an empty state." /> : (
            <ul className="grid gap-3 xl:grid-cols-2">{repurpose.map((candidate, index) => <li key={`${candidate.kind}-${candidate.contentItemId ?? index}-${candidate.suggestedPlatform ?? "none"}`} className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5"><div className="flex flex-wrap items-start justify-between gap-2"><span className="text-sm font-semibold text-ink-primary">{candidate.title}</span><StatusBadge tone={CONFIDENCE_TONES[candidate.confidence]}>{CONFIDENCE_LABELS[candidate.confidence]}</StatusBadge></div><p className="mt-1 text-[11px] text-ink-muted">{REPURPOSE_KIND_LABELS[candidate.kind]}{candidate.suggestedPlatform ? ` · suggested for ${PLATFORM_LABELS[candidate.suggestedPlatform]}` : ""}</p><p className="mt-2 text-xs leading-5 text-ink-secondary">{candidate.reason}</p>{candidate.contentItemId ? <Link href={`/dashboard/content/${candidate.contentItemId}`} className="mt-3 inline-flex items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight">Open original to plan</Link> : null}</li>)}</ul>
          )}
          <p className="mt-4 text-xs leading-5 text-ink-muted">A suggestion is a planning action. Producing, approving and scheduling remain separate workflows, and human approval remains mandatory before publication.</p>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
