import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountCard } from "@/components/accounts/account-card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { PROVIDER_STATUS } from "@/lib/publishing/providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { PLATFORM_LABELS } from "@/lib/variants/types";
import {
  DEFAULT_DAILY_QUOTA_UNITS,
  QUOTA_COST,
  REQUESTABLE_PRIVACY_STATUSES,
  shortScopeName,
  UPLOADS_PER_DEFAULT_QUOTA,
  YOUTUBE_SCOPES,
} from "@/lib/youtube/config";
import { MEDIA_RETRIEVAL_DETAIL } from "@/lib/youtube/media-source";
import { resolveYouTubeConfig } from "@/lib/youtube/server-config";

import { connectYouTube, disconnectYouTube } from "./actions";

export const metadata: Metadata = {
  title: "Connected Accounts · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Notices, phrased so each one says what to do next.
 *
 * Nothing here echoes anything Google sent back. A callback URL and its query
 * string end up in browser history and referrer headers, so the reason codes
 * are this application's own vocabulary, mapped to text on the server.
 */
const NOTICES: Record<string, string> = {
  connected: "The YouTube channel is connected.",
  declined: "Authorisation was declined at Google. Nothing was connected.",
  "google-refused": "Google refused the authorisation. Nothing was connected.",
  "invalid-callback": "That authorisation link was incomplete. Start again.",
  "not-configured":
    "Google credentials are not configured on the server, so nothing can be connected.",
  "no-worker-credential":
    "No trusted server credential is configured, so credentials cannot be stored.",
  "state-failed": "The authorisation could not be started. Try again.",
  "state-refused":
    "That authorisation link had expired or been used already. Start again.",
  "exchange-failed":
    "Google would not exchange the authorisation. Start again.",
  "scope-refused":
    "Upload permission was not granted, so the channel cannot be connected. Connect again and leave every permission ticked.",
  "channel-lookup-failed":
    "The channel could not be read back from YouTube, so nothing was recorded.",
  "no-channel":
    "That Google account has no YouTube channel. Create one, then connect again.",
  "no-refresh-token":
    "Google did not issue a refresh token. Remove this application under your Google Account security settings, then connect again.",
  "save-failed": "The connection could not be saved. Nothing was recorded.",
  disconnected: "Disconnected, and the authorisation was revoked at Google.",
  "disconnected-not-revoked":
    "Disconnected locally, but Google did not confirm the revocation. Remove this application manually under your Google Account security settings.",
  "unknown-account": "That account could not be found.",
};

/**
 * Connected Accounts.
 *
 * The first page in this product that can grant a real external capability, so
 * it is deliberately blunt about what is and is not true:
 *
 * - It shows what the server can do (configuration), not what it wishes it
 *   could.
 * - It shows the quota an upload actually costs, because six uploads a day is
 *   a real ceiling and finding it mid-afternoon is worse than reading it here.
 * - It says plainly that a connected channel still cannot be published to,
 *   because no integration can fetch the video file.
 */
export default async function ConnectedAccountsPage(
  props: PageProps<"/dashboard/accounts">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const searchParams = await props.searchParams;
  const noticeKey = Array.isArray(searchParams.notice)
    ? searchParams.notice[0]
    : searchParams.notice;
  const notice = noticeKey ? NOTICES[noticeKey] : undefined;

  const accounts = await loadSocialAccounts();
  const youtubeAccounts = accounts.filter(
    (account) => account.platform === "youtube",
  );

  const { problems } = resolveYouTubeConfig();
  const workerReady = isWorkerConfigured();
  const canConnect = problems.length === 0 && workerReady;

  return (
    <DashboardShell
      title="Connected Accounts"
      pathname="/dashboard/accounts"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Connected Accounts
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Authorisations this dashboard holds on your behalf. Credentials are
            encrypted and stored where the browser cannot reach them — nothing
            on this page has ever seen a token.
          </p>
        </div>

        {notice ? (
          <p
            role="status"
            className="rounded-lg border border-edge bg-panel-raised/50 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </p>
        ) : null}

        <SectionCard
          title="YouTube"
          description="Google OAuth 2.0 with the YouTube Data API v3."
          action={
            <StatusBadge tone={canConnect ? "configured" : "inactive"}>
              {canConnect ? "Ready to connect" : "Not configured"}
            </StatusBadge>
          }
        >
          {problems.length > 0 || !workerReady ? (
            <div className="mb-4">
              <p className="text-sm text-ink-secondary">
                Connecting needs the following before it can start:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
                {workerReady ? null : (
                  <li>
                    No trusted server credential is configured, so encrypted
                    credentials cannot be written.
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">
                See docs/stage-7-youtube.md for the one-time Google Cloud setup.
              </p>
            </div>
          ) : null}

          {youtubeAccounts.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No YouTube channel connected."
              description="Connecting sends you to Google to authorise this dashboard. It asks for permission to upload, to read your channel, and to manage playlists — nothing else."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {youtubeAccounts.map((account) => (
                <li key={account.id}>
                  <AccountCard
                    account={account}
                    disconnectAction={disconnectYouTube}
                  />
                </li>
              ))}
            </ul>
          )}

          <form action={connectYouTube} className="mt-4">
            <button
              type="submit"
              disabled={!canConnect}
              className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
            >
              {youtubeAccounts.length === 0
                ? "Connect YouTube"
                : "Reconnect YouTube"}
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="What this connection can do"
          description="Read this before connecting. Every limit below is the platform's, not this dashboard's."
        >
          <ul className="flex flex-col gap-3 text-sm text-ink-secondary">
            <li>
              <span className="font-medium text-ink-primary">
                Permissions requested
              </span>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {YOUTUBE_SCOPES.map((scope) => (
                  <li
                    key={scope}
                    className="rounded border border-edge/70 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
                  >
                    {shortScopeName(scope)}
                  </li>
                ))}
              </ul>
            </li>
            <li>
              <span className="font-medium text-ink-primary">Daily quota</span>
              <p className="mt-0.5 text-ink-muted">
                An upload costs {QUOTA_COST.videosInsert} of a default{" "}
                {DEFAULT_DAILY_QUOTA_UNITS.toLocaleString("en-GB")} units a day
                — about {UPLOADS_PER_DEFAULT_QUOTA} uploads. Raising it means
                applying to Google.
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">Privacy</span>
              <p className="mt-0.5 text-ink-muted">
                Only {REQUESTABLE_PRIVACY_STATUSES.join(" and ")} can be
                requested. Google forces uploads from an API client that has not
                passed its compliance audit to private, so offering “public”
                would offer something the platform overrides.
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Publishing still cannot happen
              </span>
              <p className="mt-0.5 text-ink-muted">{MEDIA_RETRIEVAL_DETAIL}</p>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Other platforms"
          description="Nothing is connected, and no adapter exists to connect it with."
        >
          <ul className="flex flex-col gap-2">
            {PROVIDER_STATUS.filter(
              (status) => status.platform !== "youtube",
            ).map((status) => (
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
                <StatusBadge tone="inactive">Not built</StatusBadge>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
