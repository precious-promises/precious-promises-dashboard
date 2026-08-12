import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
import { buildWeeklyMission, missionAbsenceReason } from "@/lib/growth/mission";
import {
  findMissingPlatformCandidates,
  findShortsCandidates,
  REPURPOSE_KIND_LABELS,
} from "@/lib/growth/repurpose";
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
          className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-sm font-medium text-ink-primary">
              {finding.groupLabel}
            </span>
            <StatusBadge tone={CONFIDENCE_TONES[finding.confidence.level]}>
              {CONFIDENCE_LABELS[finding.confidence.level]}
            </StatusBadge>
          </div>

          <p className="mt-1 text-xs leading-5 text-ink-secondary">
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

  return (
    <DashboardShell
      title="Growth Centre"
      pathname="/dashboard/growth"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Growth Centre
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            What the published work actually did, and how much of it is worth
            believing. Every finding describes the observed data — none of them
            claims to know why.
          </p>
        </div>

        <SectionCard
          title="This week"
          description="One thing to do, derived from the evidence. Absent when the evidence is not there."
        >
          {mission === null ? (
            <EmptyState
              icon={Sparkles}
              title="No mission yet."
              description={missionAbsenceReason(missionInputs)}
            />
          ) : (
            <div className="rounded-lg border border-edge bg-panel-raised/50 px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-primary">
                  {mission.headline}
                </h3>
                <StatusBadge tone={CONFIDENCE_TONES[mission.confidence]}>
                  {CONFIDENCE_LABELS[mission.confidence]}
                </StatusBadge>
              </div>

              <p className="mt-1.5 text-sm text-ink-secondary">
                {mission.action}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-ink-muted">
                {mission.rationale}
              </p>

              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[11px] leading-5 text-ink-muted">
                {mission.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Data quality"
          description="How much evidence exists. Read this before anything below it."
        >
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
              <dt className="text-xs text-ink-muted">Published posts</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {overview.publishedCount}
              </dd>
            </div>
            <div className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
              <dt className="text-xs text-ink-muted">Measured posts</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {overview.measuredCount}
              </dd>
            </div>
            <div className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3">
              <dt className="text-xs text-ink-muted">Comparable groups</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                {new Set(posts.map((post) => post.platform)).size}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Findings are only shown within a comparison set — same platform,
            similar length. A two-hour teaching and a thirty-second Short are
            never ranked against each other, because the comparison would
            describe the format rather than the content.
          </p>

          <ul className="mt-3 flex flex-col gap-1 text-[11px] leading-5 text-ink-muted">
            {(
              [
                "strong_pattern",
                "moderate_evidence",
                "early_signal",
                "insufficient_data",
              ] as ConfidenceLevel[]
            ).map((level) => (
              <li key={level}>
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
            <ul className="flex flex-col gap-2">
              {standouts.map((winner) => (
                <li
                  key={winner.post.scheduledPostId}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
                      {winner.post.title ?? "Untitled"}
                    </span>
                    <StatusBadge tone="configured">
                      Top {Math.max(1, Math.round(100 - winner.percentile))}%
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">
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

        <SectionCard
          title="Topics"
          description="Grouped by the topic stored on each content item. Nothing here classifies Scripture or infers a topic from verse text."
        >
          <FindingList
            findings={topicFindings}
            emptyMessage="No topic has enough comparable measured posts yet to say anything about it."
          />
        </SectionCard>

        <SectionCard
          title="Length"
          description="Bands derived from the shapes this product makes, not from any claim about what an algorithm prefers."
        >
          <FindingList
            findings={durationFindings}
            emptyMessage="Not enough measured posts across different lengths to compare them."
          />
        </SectionCard>

        <SectionCard
          title="Posting time"
          description={`Weekday and local time band, in ${DEFAULT_TIMEZONE}. Instants are stored in UTC and converted here, because the day that matters is the one Dave posted on.`}
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
          description="Deterministic properties only — does it ask a question, does it carry a Scripture reference, how long is it. No model judges whether a hook is good."
        >
          <FindingList
            findings={titleFindings}
            emptyMessage="Not enough measured posts with titles to compare styles."
          />
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
            <ul className="flex flex-col gap-2">
              {repurpose.map((candidate, index) => (
                <li
                  key={`${candidate.kind}-${candidate.contentItemId ?? index}-${candidate.suggestedPlatform ?? "none"}`}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
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
      </div>
    </DashboardShell>
  );
}
