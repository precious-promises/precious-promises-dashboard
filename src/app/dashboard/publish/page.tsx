import { Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PublishQueueEntry } from "@/components/publish/queue-entry";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { PROVIDER_STATUS } from "@/lib/publishing/providers";
import {
  groupQueue,
  loadPublishQueue,
  QUEUE_SECTIONS,
} from "@/lib/publishing/repository";
import { SCHEDULE_STATUS_LABELS } from "@/lib/schedule/types";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Publish Queue · Precious Promises",
  robots: { index: false, follow: false },
};

const SECTION_NOTES: Partial<Record<string, string>> = {
  scheduled: "Waiting for their time. The dispatcher claims them when due.",
  queued: "Claimed by a worker and waiting to be sent.",
  publishing: "A provider call is in flight.",
  failed: "Stopped, with the reason recorded.",
  posted:
    "Confirmed live, with the platform's own post id. Empty until a platform integration exists.",
};

/**
 * The Publish Queue.
 *
 * Real `scheduled_posts` and `publish_attempts` rows only — there are no
 * fabricated rows anywhere on this page.
 *
 * **Nothing can be published.** No platform provider is connected, so the
 * safety gate refuses every attempt before anything leaves the system, and
 * `Posted` is structurally empty: the database will not accept that status
 * without the platform's own post id.
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

  return (
    <DashboardShell
      title="Publish Queue"
      pathname="/dashboard/publish"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Publish Queue
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            The publishing infrastructure: claims, attempts and outcomes. No
            platform is connected, so nothing here can post — every attempt is
            refused before anything is sent, and the refusal is recorded.
          </p>
        </div>

        <SectionCard
          title="Platform connections"
          description="Publishing needs a connected account. None exists."
        >
          <ul className="flex flex-col gap-2">
            {PROVIDER_STATUS.map((status) => (
              <li
                key={status.platform}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-primary">
                    {PLATFORM_LABELS[status.platform]}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {status.detail}
                  </span>
                </span>
                <StatusBadge tone="inactive">Not connected</StatusBadge>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-ink-muted">
            Background worker:{" "}
            {workerReady
              ? "credential configured."
              : "no trusted credential configured, so the dispatcher cannot run."}{" "}
            Either way, no provider exists to publish with.
          </p>
        </SectionCard>

        {entries.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={Send}
              title="Nothing in the queue."
              description="Approve a platform variant and give it a time in the Calendar. It will appear here — and stop at the safety gate, because no platform is connected."
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
          QUEUE_SECTIONS.map((section) => {
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
                      ? "Nothing has been published, and nothing can be until a platform integration exists."
                      : "Nothing here."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {sectionEntries.map((entry) => (
                      <PublishQueueEntry key={entry.post.id} entry={entry} />
                    ))}
                  </ul>
                )}
              </SectionCard>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
