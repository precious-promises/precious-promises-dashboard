import {
  BarChart3,
  Clock3,
  DatabaseZap,
  RefreshCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
import { PLATFORM_LABELS } from "@/lib/variants/types";
import { analyticsSchedulingConnected } from "@/trigger/analytics";

export const metadata: Metadata = {
  title: "Analytics · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Analytics.
 *
 * There is no sample data on this page. Every figure is a stored observation
 * from a real published post or a clearly labelled manual reading. Absence is
 * never converted into zero, and a failed refresh never erases the last known
 * good observation.
 */

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

function MetricTile({
  metric,
  value,
}: {
  metric: MetricName;
  value: MetricReading;
}) {
  return (
    <div className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-4">
      <p className="text-xs font-medium text-ink-muted">
        {METRIC_LABELS[metric]}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${
          value.available ? "text-ink-primary" : "text-ink-muted"
        }`}
      >
        {formatReading(value)}
      </p>
      {value.available ? (
        <p className="mt-2 text-[11px] leading-5 text-ink-muted">
          {METRIC_SOURCE_LABELS[value.source]} · observed{" "}
          {describeFreshness(value.observedAt)}
        </p>
      ) : (
        <>
          <p className="mt-2 text-[11px] font-medium text-gold">
            {UNAVAILABLE_LABELS[value.reason]}
          </p>
          {value.lastKnown ? (
            <p className="mt-1 text-[11px] leading-5 text-ink-muted">
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
  const schedulingConnected = analyticsSchedulingConnected();
  const authorisedPlatforms = overview.readiness.filter(
    (entry) => entry.analyticsAuthorised && entry.blockedBy === null,
  ).length;
  const failedPlatforms = overview.readiness.filter(
    (entry) => entry.lastSync?.status === "failed",
  ).length;

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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <BarChart3 aria-hidden="true" className="size-4" />
                Measurement evidence centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Analytics
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Read only what has genuinely been observed. Every available
                figure keeps its source and observation time; unavailable data
                stays unavailable instead of being turned into a decorative
                zero.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/growth"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Growth Centre
              </Link>
              <Link
                href="/dashboard/accounts"
                className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Connected Accounts
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Analytics evidence metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Published"
            value={overview.publishedCount}
            detail="Posts recorded as genuinely published"
          />
          <Metric
            label="Measured"
            value={overview.measuredCount}
            detail="Published posts with stored observations"
          />
          <Metric
            label="Analytics ready"
            value={authorisedPlatforms}
            detail="Platforms authorised and unblocked"
          />
          <Metric
            label="Latest failures"
            value={failedPlatforms}
            detail="Platforms whose latest sync failed"
          />
          <Metric
            label="Auto sync"
            value={schedulingConnected ? "Running" : "Not running"}
            detail="Trigger.dev scheduling connection state"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Evidence status
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Measurement before interpretation
                </h3>
              </div>
              <StatusBadge tone={overview.hasAnyData ? "configured" : "inactive"}>
                {overview.hasAnyData
                  ? `Last fetched ${describeFreshness(overview.lastFetchedAt)}`
                  : "Nothing fetched"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Publish", "A real platform post must exist"],
                ["2", "Authorise", "Analytics permission must be available"],
                ["3", "Observe", "Provider or owner records a reading"],
                ["4", "Interpret", "Growth tools may then use the evidence"],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-panel/40 px-4 py-4"
                >
                  <span className="text-xs font-semibold text-highlight">
                    {step}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-ink-primary">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-ink-muted"
              />
              Analytics truth boundary
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Published ≠ measured.</li>
              <li>Connected account ≠ analytics authorised.</li>
              <li>Zero is a measurement; absence is not.</li>
              <li>Failed refresh ≠ lost historical observation.</li>
              <li>Stored observation ≠ proof of why performance changed.</li>
            </ul>
          </div>
        </section>

        <SectionCard
          title="Headline measurements"
          description="Totals across measured posts. If nobody has reported a metric, the dashboard shows a dash rather than manufacturing zero."
          action={
            stale && overview.hasAnyData ? (
              <StatusBadge tone="accent">Figures may be out of date</StatusBadge>
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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
              <p className="mt-4 text-xs leading-5 text-ink-muted">
                {overview.measuredCount} of {overview.publishedCount} published{" "}
                {overview.publishedCount === 1 ? "post has" : "posts have"} been
                measured. The rest are unmeasured, which is not the same as
                having performed badly.
              </p>
            </>
          )}
        </SectionCard>

        <SectionCard
          title="Platform readiness"
          description="Adapter implementation, account connection, publishing permission and analytics permission remain separate states."
        >
          <ul className="grid gap-3 xl:grid-cols-2">
            {overview.readiness.map((entry) => {
              const capability = analyticsCapabilityFor(entry.platform);

              return (
                <li
                  key={entry.platform}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-primary">
                        {PLATFORM_LABELS[entry.platform]}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-ink-muted">
                        {capability.metrics.length > 0
                          ? `${capability.metrics.length} supported dashboard metric${capability.metrics.length === 1 ? "" : "s"}`
                          : "No supported API analytics metrics"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4">
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <dt className="text-ink-muted">Adapter</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {entry.providerImplemented ? "Built" : "None"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <dt className="text-ink-muted">Account</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {entry.accountConnected ? "Connected" : "Not connected"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <dt className="text-ink-muted">Publishing</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
                        {entry.publishingAuthorised
                          ? "Authorised"
                          : "Not authorised"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2.5">
                      <dt className="text-ink-muted">Last sync</dt>
                      <dd className="mt-1 font-medium text-ink-secondary">
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
                    <p className="mt-3 rounded-lg border border-gold-dim/50 bg-gold/10 px-3 py-2 text-[11px] leading-5 text-gold">
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
                    <p className="mt-3 text-[11px] leading-5 text-ink-muted">
                      {UNAVAILABLE_DETAIL[entry.blockedBy]}
                      {entry.action ? ` ${entry.action}` : ""}
                    </p>
                  ) : null}

                  {entry.missingScopes.length > 0 ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                      Missing permission:{" "}
                      <span className="font-mono">
                        {entry.missingScopes.join(", ")}
                      </span>
                    </p>
                  ) : null}

                  {!entry.providerImplemented ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                      {capability.detail}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            title="Synchronisation"
            description="Manual and scheduled refresh use the same analytics pipeline."
            action={
              <StatusBadge tone={schedulingConnected ? "configured" : "inactive"}>
                {schedulingConnected
                  ? "Scheduled"
                  : "Implemented, not running"}
              </StatusBadge>
            }
          >
            <div className="flex items-start gap-3 rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-4">
              <RefreshCcw
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
              />
              <p className="text-sm leading-6 text-ink-secondary">
                {schedulingConnected
                  ? "A Trigger.dev project is configured, so the daily sync runs on its own."
                  : "The daily sync task is written and type-checked, but no Trigger.dev project is connected — so nothing runs on a schedule. Refreshing by hand above works regardless, and uses exactly the same code the scheduled run would."}
              </p>
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-edge/70 bg-panel/30 px-4 py-3">
              <Clock3
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
              />
              <p className="text-xs leading-5 text-ink-muted">
                A failed refresh is recorded as a failed run. Previously stored
                good observations remain available with their original dates.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Manual observation"
            description="Use only when a legitimate platform reading exists but no supported API can supply it."
          >
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3">
              <DatabaseZap
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-ink-muted"
              />
              <p className="text-xs leading-5 text-ink-muted">
                Manual entries are permanently labelled as entered by hand and
                never become API-sourced evidence later.
              </p>
            </div>
            <ManualEntryForm />
          </SectionCard>
        </section>

        <SectionCard
          title="Metric coverage by platform"
          description="Provider-specific metric meaning is preserved. Similar names are not treated as identical methodology."
        >
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {overview.readiness.map((entry) => {
              const capability = analyticsCapabilityFor(entry.platform);

              return (
                <li
                  key={entry.platform}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-4"
                >
                  <p className="text-sm font-semibold text-ink-primary">
                    {PLATFORM_LABELS[entry.platform]}
                  </p>
                  {capability.metrics.length === 0 ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
                      No metrics are available from this platform through any
                      API this dashboard can legitimately use.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {capability.metrics.map((metric) => (
                        <li
                          key={metric}
                          className="rounded-md border border-edge/70 bg-panel/30 px-2 py-1 text-[11px] text-ink-muted"
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
          <p className="mt-4 text-xs leading-5 text-ink-muted">
            YouTube views, Instagram views and TikTok video views are counted
            differently. This dashboard preserves those platform distinctions
            instead of implying that every number was produced by the same
            measurement method.
          </p>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
