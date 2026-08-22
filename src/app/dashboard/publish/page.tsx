import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Send,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PublishQueueEntry } from "@/components/publish/queue-entry";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { PROVIDER_STATUS } from "@/lib/publishing/providers";
import {
  groupQueue,
  loadPublishQueue,
  QUEUE_SECTIONS,
} from "@/lib/publishing/repository";
import { SCHEDULE_STATUS_LABELS } from "@/lib/schedule/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import { MEDIA_RETRIEVAL_DETAIL } from "@/lib/youtube/media-source";

export const metadata: Metadata = {
  title: "Publish Queue · Precious Promises",
  robots: { index: false, follow: false },
};

const SECTION_NOTES: Partial<Record<string, string>> = {
  scheduled: "Waiting for their time. The dispatcher claims them when due.",
  queued: "Claimed by a worker and waiting to be sent.",
  publishing: "A provider call is in flight.",
  ready_for_manual_post:
    "Prepared for you to post by hand. Nothing was sent to the platform, and nothing will be until you post it yourself.",
  uploaded_to_platform_draft:
    "The platform has the video in its own drafts. Nobody has seen it — open the platform's app, review it and publish it there.",
  failed: "Stopped, with the reason recorded.",
  posted:
    "Confirmed live, with the platform's own post id. Nothing reaches here until a provider returns that proof.",
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
  icon: typeof Send;
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

/**
 * The Publish Queue.
 *
 * Real `scheduled_posts` and `publish_attempts` rows only. A scheduled row is
 * intent to publish, not evidence of publication. Posted requires provider
 * proof retained by the database.
 */
export default async function PublishQueuePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const entries = await loadPublishQueue();
  const grouped = groupQueue(entries);
  const workerReady = isWorkerConfigured();

  const connectedPlatforms = new Set(
    (await loadSocialAccounts())
      .filter((account) => account.status === "connected")
      .map((account) => account.platform),
  );

  const scheduledCount = grouped.get("scheduled")?.length ?? 0;
  const inFlightCount =
    (grouped.get("queued")?.length ?? 0) +
    (grouped.get("publishing")?.length ?? 0);
  const manualCount =
    (grouped.get("ready_for_manual_post")?.length ?? 0) +
    (grouped.get("uploaded_to_platform_draft")?.length ?? 0);
  const failedCount = grouped.get("failed")?.length ?? 0;
  const postedCount = grouped.get("posted")?.length ?? 0;
  const attemptCount = entries.reduce(
    (sum, entry) => sum + entry.attempts.length,
    0,
  );

  return (
    <DashboardShell
      title="Publish Queue"
      pathname="/dashboard/publish"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(77,141,247,0.16),transparent_34%),linear-gradient(135deg,rgba(12,20,42,0.96),rgba(7,11,22,0.96))] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-highlight/30 bg-highlight/10 px-3 py-1 text-xs font-medium text-highlight-soft">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Publishing control centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Publish Queue
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                See what is waiting, what was attempted, what stopped, and what
                a platform actually confirmed. A schedule is never presented as
                a successful publication.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/calendar"
                className="rounded-lg border border-edge-strong bg-panel-raised/70 px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Content Calendar
              </Link>
              <Link
                href="/dashboard/accounts"
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Connected Accounts
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="Scheduled"
            value={scheduledCount}
            note="Real schedule rows still waiting for their due time."
            icon={Clock3}
          />
          <Metric
            label="In Flight"
            value={inFlightCount}
            note="Rows claimed or actively inside a provider attempt."
            icon={UploadCloud}
          />
          <Metric
            label="Manual"
            value={manualCount}
            note="Prepared for an owner-controlled manual platform step."
            icon={Wrench}
          />
          <Metric
            label="Failed"
            value={failedCount}
            note="Stopped publish flows with their recorded reason retained."
            icon={AlertTriangle}
          />
          <Metric
            label="Posted"
            value={postedCount}
            note="Rows with provider-side publication proof recorded."
            icon={CheckCircle2}
          />
          <Metric
            label="Attempts"
            value={attemptCount}
            note="Actual stored publish-attempt records across this queue."
            icon={Send}
          />
        </section>

        {failedCount > 0 ? (
          <div className="rounded-2xl border border-gold-dim/60 bg-gold/10 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-gold"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold text-gold">
                  {failedCount} publish flow{failedCount === 1 ? "" : "s"}{" "}
                  stopped.
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  Open the affected row to inspect the latest safe error and its
                  attempt history before retrying or changing the setup.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
          <SectionCard
            title="Platform readiness"
            description="What the current provider layer can actually do, plus live account and worker prerequisites."
          >
            <ul className="flex flex-col gap-2.5">
              {PROVIDER_STATUS.map((status) => {
                const connected = connectedPlatforms.has(status.platform);
                return (
                  <li
                    key={status.platform}
                    className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-primary">
                          {PLATFORM_LABELS[status.platform]}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-ink-muted">
                          {status.detail}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <StatusBadge
                          tone={status.implemented ? "accent" : "inactive"}
                        >
                          {status.implemented ? "Adapter built" : "Not built"}
                        </StatusBadge>
                        <StatusBadge
                          tone={connected ? "configured" : "inactive"}
                        >
                          {connected ? "Connected" : "Not connected"}
                        </StatusBadge>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard
            title="Dispatcher readiness"
            description="Background execution must be configured separately from provider code and account authorisation."
          >
            <div className="rounded-xl border border-edge/70 bg-panel-raised/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-primary">
                    Background worker
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {workerReady
                      ? "Trusted worker credential is configured."
                      : "No trusted worker credential is configured, so the dispatcher cannot run."}
                  </p>
                </div>
                <StatusBadge tone={workerReady ? "configured" : "inactive"}>
                  {workerReady ? "Configured" : "Not configured"}
                </StatusBadge>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {MEDIA_RETRIEVAL_DETAIL}
            </p>
          </SectionCard>
        </div>

        {entries.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
            <EmptyState
              icon={Send}
              title="Nothing in the queue."
              description="Approve a platform variant and give it a time in the Calendar. It will appear here as a real queue row, not as fabricated activity."
              action={
                <Link
                  href="/dashboard/calendar"
                  className="rounded-lg border border-edge-strong bg-panel-raised/60 px-4 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Open Calendar
                </Link>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {QUEUE_SECTIONS.map((section) => {
              const sectionEntries = grouped.get(section) ?? [];
              return (
                <SectionCard
                  key={section}
                  title={SCHEDULE_STATUS_LABELS[section]}
                  description={SECTION_NOTES[section]}
                  action={
                    <StatusBadge tone="inactive">
                      {sectionEntries.length}
                    </StatusBadge>
                  }
                >
                  {sectionEntries.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {section === "posted"
                        ? "No provider-confirmed live posts are recorded here."
                        : "Nothing here."}
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {sectionEntries.map((entry) => (
                        <PublishQueueEntry
                          key={entry.post.id}
                          entry={entry}
                          platformConnected={connectedPlatforms.has(
                            entry.variant.platform,
                          )}
                        />
                      ))}
                    </ul>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-edge bg-panel/55 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-highlight"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Publishing truth boundary
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Scheduled means waiting. Queued means claimed. Publishing means
                an attempt is active. Manual or platform-draft states still
                require an owner action. Only a provider-confirmed post id can
                move a row into Posted, and even that is reported separately
                from any later live-watchability check.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
