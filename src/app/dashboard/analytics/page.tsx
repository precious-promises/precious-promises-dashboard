import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ManualEntryForm } from "@/components/analytics/manual-entry-form";
import { AnalyticsRefreshButton } from "@/components/analytics/refresh-button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import { analyticsCapabilityFor } from "@/lib/analytics/providers";
import {
  describeFreshness,
  formatReading,
  isStale,
  METRIC_LABELS,
  METRIC_SOURCE_LABELS,
  UNAVAILABLE_DETAIL,
  UNAVAILABLE_LABELS,
  type MetricName,
  type MetricReading,
} from "@/lib/analytics/types";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { analyticsSchedulingConnected } from "@/trigger/analytics";
import { PLATFORM_LABELS } from "@/lib/variants/types";

export const metadata: Metadata = {
  title: "Analytics · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Analytics.
 *
 * **There is no sample data on this page, and there never will be.** Every
 * figure comes from a real observation of a real post, or it is not a figure —
 * it is an em dash with a reason beside it.
 *
 * That is the whole design. A dashboard that shows "0 views" when the truth is
 * "YouTube is not connected" teaches its owner that the numbers are decorative,
 * and once he believes that, the real numbers cannot reach him either.
 */

/** One headline figure, or an honest account of its absence. */
function MetricTile({
  metric,
  value,
}: {
  metric: MetricName;
  value: MetricReading;
}) {
  return (
    <div className="rounded-lg border border-edge/70 bg-panel-raised/40 px-4 py-3.5">
      <p className="text-xs font-medium text-ink-muted">
        {METRIC_LABELS[metric]}
      </p>

      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          value.available ? "text-ink-primary" : "text-ink-muted"
        }`}
      >
        {formatReading(value)}
      </p>

      {value.available ? (
        <p className="mt-1 text-[11px] leading-4 text-ink-muted">
          {METRIC_SOURCE_LABELS[value.source]} · observed{" "}
          {describeFreshness(value.observedAt)}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] font-medium text-gold">
            {UNAVAILABLE_LABELS[value.reason]}
          </p>
          {value.lastKnown ? (
            <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
              Last read {describeFreshness(value.lastKnown.observedAt)}:{" "}
              {Math.round(value.lastKnown.value).toLocaleString("en-GB")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default async function AnalyticsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const overview = await loadAnalyticsOverview();
  const stale = isStale(overview.lastFetchedAt);

  const headlineMetrics: MetricName[] = [
    "views_or_plays",
    "watch_time_seconds",
    "engagements",
    "followers_gained",
  ];

  return (
    <DashboardShell
      title="Analytics"
      pathname="/dashboard/analytics"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Analytics
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            What has actually been measured. Every figure carries where it came
            from and when it was read — and where nothing has been measured,
            this page says so rather than showing a zero.
          </p>
        </div>

        <SectionCard
          title="Where the figures come from"
          description="Analytics permission is a separate grant from publishing permission. A connected account is not automatically a measurable one."
          action={
            <StatusBadge tone={overview.hasAnyData ? "configured" : "inactive"}>
              {overview.hasAnyData
                ? `Last fetched ${describeFreshness(overview.lastFetchedAt)}`
                : "Nothing fetched"}
            </StatusBadge>
          }
        >
          <ul className="flex flex-col gap-2.5">
            {overview.readiness.map((entry) => {
              const capability = analyticsCapabilityFor(entry.platform);

              return (
                <li
                  key={entry.platform}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
                      {PLATFORM_LABELS[entry.platform]}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge
                        tone={
                          entry.analyticsAuthorised && entry.blockedBy === null
                            ? "configured"
                            : entry.providerImplemented
                              ? "accent"
                              : "inactive"
                        }
                      >
                        {entry.blockedBy === null
                          ? "Analytics available"
                          : UNAVAILABLE_LABELS[entry.blockedBy]}
                      </StatusBadge>
                      {entry.analyticsAuthorised ? (
                        <AnalyticsRefreshButton platform={entry.platform} />
                      ) : null}
                    </span>
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                    <div>
                      <dt className="text-ink-muted">Adapter</dt>
                      <dd className="text-ink-secondary">
                        {entry.providerImplemented ? "Built" : "None"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Account</dt>
                      <dd className="text-ink-secondary">
                        {entry.accountConnected ? "Connected" : "Not connected"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Publishing</dt>
                      <dd className="text-ink-secondary">
                        {entry.publishingAuthorised
                          ? "Authorised"
                          : "Not authorised"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Last sync</dt>
                      <dd className="text-ink-secondary">
                        {entry.lastSuccessfulSync
                          ? describeFreshness(
                              entry.lastSuccessfulSync.completed_at ??
                                entry.lastSuccessfulSync.started_at,
                            )
                          : "Never"}
                      </dd>
                    </div>
                  </dl>

                  {entry.lastSync && entry.lastSync.status === "failed" ? (
                    // Shown apart from the last success, never instead of it.
                    // A failed refresh does not delete the figures it failed to
                    // update.
                    <p className="mt-2 rounded-md border border-gold-dim/50 bg-gold/10 px-2.5 py-1.5 text-[11px] leading-5 text-gold">
                      Latest refresh failed
                      {entry.lastSync.error_category
                        ? ` (${entry.lastSync.error_category})`
                        : ""}
                      {entry.lastSuccessfulSync
                        ? `. Figures shown were read ${describeFreshness(entry.lastSuccessfulSync.completed_at ?? entry.lastSuccessfulSync.started_at)}.`
                        : "."}
                    </p>
                  ) : null}

                  {entry.blockedBy ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                      {UNAVAILABLE_DETAIL[entry.blockedBy]}
                      {entry.action ? ` ${entry.action}` : ""}
                    </p>
                  ) : null}

                  {entry.missingScopes.length > 0 ? (
                    <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                      Missing permission:{" "}
                      <span className="font-mono">
                        {entry.missingScopes.join(", ")}
                      </span>
                    </p>
                  ) : null}

                  {!entry.providerImplemented ? (
                    <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                      {capability.detail}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard
          title="Totals"
          description="Across every measured post. A metric no platform has reported shows a dash, not a zero."
          action={
            stale && overview.hasAnyData ? (
              <StatusBadge tone="accent">
                Figures may be out of date
              </StatusBadge>
            ) : null
          }
        >
          {overview.publishedCount === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Nothing has been published yet."
              description="Analytics describe published posts. Once something has genuinely gone out to a platform and analytics permission has been granted, its figures will appear here — measured, dated and attributed."
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {headlineMetrics.map((metric) => (
                  <MetricTile
                    key={metric}
                    metric={metric}
                    value={
                      overview.totals[metric] ?? {
                        available: false,
                        metric,
                        reason: "not_yet_fetched",
                      }
                    }
                  />
                ))}
              </div>

              <p className="mt-3 text-xs leading-5 text-ink-muted">
                {overview.measuredCount} of {overview.publishedCount} published{" "}
                {overview.publishedCount === 1 ? "post has" : "posts have"} been
                measured. The rest are unmeasured, which is not the same as
                having performed badly.
              </p>
            </>
          )}
        </SectionCard>

        <SectionCard
          title="Scheduled synchronisation"
          description="Whether figures refresh on their own."
          action={
            <StatusBadge
              tone={analyticsSchedulingConnected() ? "configured" : "inactive"}
            >
              {analyticsSchedulingConnected()
                ? "Scheduled"
                : "Implemented, not running"}
            </StatusBadge>
          }
        >
          <p className="text-sm leading-6 text-ink-secondary">
            {analyticsSchedulingConnected()
              ? "A Trigger.dev project is configured, so the daily sync runs on its own."
              : "The daily sync task is written and type-checked, but no Trigger.dev project is connected — so nothing runs on a schedule. Refreshing by hand above works regardless, and uses exactly the same code the scheduled run would."}
          </p>
        </SectionCard>

        <SectionCard
          title="Enter a figure by hand"
          description="Mainly for TikTok, which reports nothing this dashboard can legitimately read. Anything entered here is permanently labelled as entered by hand."
        >
          <ManualEntryForm />
        </SectionCard>

        <SectionCard
          title="By platform"
          description="Raw metric names are preserved per platform. YouTube views, Instagram views and TikTok video views are counted differently, and this page does not pretend otherwise."
        >
          <ul className="flex flex-col gap-2">
            {overview.readiness.map((entry) => {
              const capability = analyticsCapabilityFor(entry.platform);

              return (
                <li
                  key={entry.platform}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <p className="text-sm font-medium text-ink-primary">
                    {PLATFORM_LABELS[entry.platform]}
                  </p>
                  {capability.metrics.length === 0 ? (
                    <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                      No metrics are available from this platform through any
                      API this dashboard can legitimately use.
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {capability.metrics.map((metric) => (
                        <li
                          key={metric}
                          className="rounded border border-edge/70 px-1.5 py-0.5 text-[11px] text-ink-muted"
                        >
                          {METRIC_LABELS[metric]}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
