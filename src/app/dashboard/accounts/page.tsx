import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AccountCard } from "@/components/accounts/account-card";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import { analyticsCapabilityFor } from "@/lib/analytics/providers";
import {
  describeFreshness,
  UNAVAILABLE_DETAIL,
  UNAVAILABLE_LABELS,
} from "@/lib/analytics/types";
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
import { DRIVE_ROOT_NAME } from "@/lib/drive/config";
import {
  LONG_LIVED_TOKEN_DAYS,
  MEDIA_DELIVERY,
  STORIES_SUPPORTED,
} from "@/lib/instagram/config";
import { resolveInstagramConfig } from "@/lib/instagram/server-config";
import { resolveDriveConfig } from "@/lib/drive/server-config";
import {
  DELIVERY_MODE_DETAIL,
  PRIVACY_LEVEL_LABELS,
  PULL_FROM_URL_REFUSAL,
  TIKTOK_SCOPES,
} from "@/lib/tiktok/config";
import { loadTikTokCapability } from "@/lib/tiktok/capability";
import { resolveTikTokConfig } from "@/lib/tiktok/server-config";
import { MEDIA_RETRIEVAL_DETAIL } from "@/lib/youtube/media-source";
import { resolveYouTubeConfig } from "@/lib/youtube/server-config";

import {
  connectGoogleDrive,
  connectInstagram,
  connectTikTok,
  connectYouTube,
  grantYouTubeAnalytics,
  disconnectGoogleDrive,
  disconnectInstagram,
  disconnectTikTok,
  disconnectYouTube,
} from "./actions";

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

  "ig-connected": "The Instagram account is connected.",
  "ig-declined":
    "Authorisation was declined at Instagram. Nothing was connected.",
  "ig-refused": "Meta refused the authorisation. Nothing was connected.",
  "ig-invalid-callback": "That authorisation link was incomplete. Start again.",
  "ig-not-configured":
    "Meta credentials are not configured on the server, so Instagram cannot be connected.",
  "ig-exchange-failed":
    "Meta would not exchange the authorisation. Start again.",
  "ig-scope-refused":
    "Content-publishing permission was not granted, so nothing could be posted. Connect again and leave every permission ticked.",
  "ig-long-lived-failed":
    "Meta issued a short-lived token but would not upgrade it to a long-lived one, so the connection would have died within the hour. Nothing was recorded.",
  "ig-account-lookup-failed":
    "The Instagram account could not be read back, so nothing was recorded.",
  "ig-no-account":
    "That authorisation returned no Instagram professional account. Instagram publishing needs a Business or Creator account.",
  "ig-disconnected":
    "Instagram disconnected and the stored credential deleted. Meta issues no revocation endpoint for this token type — remove this app under Instagram\u2019s connected-apps settings if you also want it withdrawn there.",

  "drive-connected":
    "Google Drive is connected, and the approved folder was read back successfully.",
  "drive-not-configured":
    "Google Drive is not configured on the server. GOOGLE_DRIVE_ROOT_FOLDER_ID must name the approved folder.",
  "drive-scope-refused":
    "Read permission for Drive was not granted, so the media library cannot be read. Connect again and leave the permission ticked.",
  "drive-root-unreadable":
    "The approved folder could not be read back from Drive, so nothing was recorded.",
  "drive-root-missing":
    "GOOGLE_DRIVE_ROOT_FOLDER_ID does not name a folder this account can see. Check the id and that the folder is not in the bin.",
  "drive-disconnected":
    "Google Drive disconnected, and the authorisation was revoked at Google. Imported assets were left alone.",
  "drive-disconnected-not-revoked":
    "Google Drive disconnected locally, but Google did not confirm the revocation. Remove this application manually under your Google Account security settings.",

  "tt-connected":
    "The TikTok account is connected, with permission to post directly and to send to drafts.",
  "tt-connected-drafts":
    "The TikTok account is connected, but only with draft-upload permission. Videos can be sent to your TikTok drafts; nothing can be posted directly. Reconnect and leave every permission ticked if you want direct posting.",
  "tt-declined": "Authorisation was declined at TikTok. Nothing was connected.",
  "tt-refused": "TikTok refused the authorisation. Nothing was connected.",
  "tt-invalid-callback": "That authorisation link was incomplete. Start again.",
  "tt-not-configured":
    "TikTok credentials are not configured on the server, so TikTok cannot be connected.",
  "tt-exchange-failed":
    "TikTok would not exchange the authorisation. Start again.",
  "tt-scope-refused":
    "Neither upload nor publish permission was granted, so nothing could be sent to TikTok. Connect again and leave every permission ticked.",
  "tt-account-lookup-failed":
    "The TikTok account could not be read back, so nothing was recorded.",
  "tt-no-account":
    "That authorisation returned no TikTok account, so nothing was recorded.",
  "tt-save-failed":
    "The TikTok connection could not be saved. Nothing was recorded.",
  "tt-disconnected":
    "TikTok disconnected, and the authorisation was revoked at TikTok.",
  "analytics-granted":
    "Analytics permission granted. YouTube figures can now be read, and publishing is unchanged.",
  "tt-disconnected-not-revoked":
    "TikTok disconnected locally, but TikTok did not confirm the revocation. Remove this application manually under your TikTok account settings.",
};

function OverviewMetric({
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

  const instagramAccounts = accounts.filter(
    (account) => account.platform === "instagram",
  );
  const { problems: instagramProblems } = resolveInstagramConfig();
  const canConnectInstagram = instagramProblems.length === 0 && workerReady;

  const driveAccounts = accounts.filter(
    (account) => account.platform === "google_drive",
  );
  const { problems: driveProblems } = resolveDriveConfig();
  const canConnectDrive = driveProblems.length === 0 && workerReady;

  const tiktokAccounts = accounts.filter(
    (account) => account.platform === "tiktok",
  );
  const { problems: tiktokProblems } = resolveTikTokConfig();
  const canConnectTikTok = tiktokProblems.length === 0 && workerReady;

  // Connected and "can post directly" are different questions, and this page
  // exists to answer both honestly. Direct posting needs the publish scope AND
  // TikTok's audit — and the only way to know the second is to ask TikTok what
  // audiences this creator may actually use. Loaded only when an account
  // exists, so a page with nothing connected makes no API call.
  const tiktokCapability =
    tiktokAccounts.length > 0 ? await loadTikTokCapability() : null;
  const tiktokDirectPost =
    tiktokCapability?.availableModes.includes("direct_post") ?? false;

  // Every publishing platform now has an adapter, so this list is empty in
  // practice. It stays because it is generated from the registry rather than
  // hand-maintained: the day a fourth platform is named without one, it says so
  // by itself.
  const unimplemented = PROVIDER_STATUS.filter((status) => !status.implemented);

  // Analytics readiness is a different question from publishing readiness, and
  // this page is where both are answered side by side.
  const analytics = await loadAnalyticsOverview();
  const connectedAccountCount = accounts.filter(
    (account) => account.status === "connected",
  ).length;
  const configuredIntegrationCount = [
    canConnect,
    canConnectInstagram,
    canConnectDrive,
    canConnectTikTok,
  ].filter(Boolean).length;
  const publishingConnectionCount = [
    youtubeAccounts,
    instagramAccounts,
    tiktokAccounts,
  ].filter((group) =>
    group.some((account) => account.status === "connected"),
  ).length;
  const analyticsAuthorisedCount = analytics.readiness.filter(
    (entry) => entry.accountConnected && entry.analyticsAuthorised,
  ).length;

  return (
    <DashboardShell
      title="Connected Accounts"
      pathname="/dashboard/accounts"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <Link2 aria-hidden="true" className="size-4" />
                External capability control
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Connected Accounts
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Control the real authorisations behind publishing, media access
                and analytics. Server configuration, OAuth connection, granted
                permission and current provider capability remain separate facts
                so a green connection never implies more than the provider has
                actually confirmed.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/65">
              <p className="font-semibold text-white">Credential boundary</p>
              <p className="mt-1 max-w-xs">
                Tokens stay encrypted on the server. This page receives account
                identity and capability state only; browser-visible UI never
                receives stored credentials.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Connected account evidence metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <OverviewMetric
            label="Connected"
            value={connectedAccountCount}
            detail="Account records currently marked connected"
          />
          <OverviewMetric
            label="Configured"
            value={`${configuredIntegrationCount}/4`}
            detail="Integrations able to begin an authorisation flow"
          />
          <OverviewMetric
            label="Publishing"
            value={`${publishingConnectionCount}/3`}
            detail="Publishing platforms with a connected account"
          />
          <OverviewMetric
            label="Analytics"
            value={analyticsAuthorisedCount}
            detail="Connected platforms with analytics permission"
          />
          <OverviewMetric
            label="Credential writer"
            value={workerReady ? "Ready" : "Blocked"}
            detail="Trusted server path for encrypted credentials"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Capability chain
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Configuration and live authority are not the same state
                </h3>
              </div>
              <StatusBadge tone={workerReady ? "configured" : "inactive"}>
                {workerReady
                  ? "Secure writes available"
                  : "Credential writes blocked"}
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "1",
                  "Configure",
                  "Server credentials and redirect settings must exist",
                ],
                [
                  "2",
                  "Connect",
                  "The owner must complete the provider authorisation",
                ],
                [
                  "3",
                  "Authorise",
                  "Required scopes and provider permissions must be granted",
                ],
                [
                  "4",
                  "Confirm",
                  "Current provider capability is read where the API supports it",
                ],
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
            <p className="text-sm font-semibold text-ink-primary">
              Connection truth boundary
            </p>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Configured integration ≠ connected account.</li>
              <li>Connected account ≠ every permission granted.</li>
              <li>Publishing permission ≠ provider acceptance of a post.</li>
              <li>Analytics permission ≠ publishing permission.</li>
              <li>Stored credential ≠ browser-visible credential.</li>
              <li>Account connected ≠ content published.</li>
            </ul>
          </div>
        </section>

        {notice ? (
          <p
            role="status"
            className="rounded-lg border border-edge bg-panel-raised/50 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </p>
        ) : null}

        <div className="pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Provider controls
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink-primary">
            Connect, inspect and revoke each integration
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
            The controls below are the existing real provider flows. Their
            platform limits, scopes, revocation behaviour and capability checks
            remain visible instead of being collapsed into a generic connected
            badge.
          </p>
        </div>

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
          title="Instagram"
          description="Instagram API with Instagram Login, for a professional (Business or Creator) account."
          action={
            <StatusBadge tone={canConnectInstagram ? "configured" : "inactive"}>
              {canConnectInstagram ? "Ready to connect" : "Not configured"}
            </StatusBadge>
          }
        >
          {instagramProblems.length > 0 ? (
            <div className="mb-4">
              <p className="text-sm text-ink-secondary">
                Connecting Instagram needs the following first:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {instagramProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {instagramAccounts.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No Instagram account connected."
              description="Connecting sends you to Instagram to authorise this dashboard. It asks to identify the account and to publish content — nothing else."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {instagramAccounts.map((account) => (
                <li key={account.id}>
                  <AccountCard
                    account={account}
                    disconnectAction={disconnectInstagram}
                  />
                </li>
              ))}
            </ul>
          )}

          <form action={connectInstagram} className="mt-4">
            <button
              type="submit"
              disabled={!canConnectInstagram}
              className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
            >
              {instagramAccounts.length === 0
                ? "Connect Instagram"
                : "Reconnect Instagram"}
            </button>
          </form>

          <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-secondary">
            <li>
              <span className="font-medium text-ink-primary">
                Reels can be published
              </span>
              <p className="mt-0.5 text-ink-muted">
                {MEDIA_DELIVERY.reels.detail}
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Images and carousels cannot
              </span>
              <p className="mt-0.5 text-ink-muted">
                {MEDIA_DELIVERY.image.detail}
              </p>
            </li>
            {STORIES_SUPPORTED ? null : (
              <li>
                <span className="font-medium text-ink-primary">
                  Stories are not implemented
                </span>
                <p className="mt-0.5 text-ink-muted">
                  They use the same URL-fetch delivery as images, so they carry
                  the same refusal.
                </p>
              </li>
            )}
            <li>
              <span className="font-medium text-ink-primary">
                The connection expires
              </span>
              <p className="mt-0.5 text-ink-muted">
                Meta issues no refresh token. A long-lived token lasts{" "}
                {LONG_LIVED_TOKEN_DAYS} days and is refreshed when it is used —
                so a connection left completely unused for{" "}
                {LONG_LIVED_TOKEN_DAYS} days dies and has to be reconnected.
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">App Review</span>
              <p className="mt-0.5 text-ink-muted">
                Publishing needs the content-publishing permission, which Meta
                grants only after App Review. Before that, the app can act only
                for users who hold a role on it.
              </p>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Google Drive"
          description={`Read-only access to the approved ${DRIVE_ROOT_NAME} folder. This is where publishable media is read from.`}
          action={
            <StatusBadge tone={canConnectDrive ? "configured" : "inactive"}>
              {canConnectDrive ? "Ready to connect" : "Not configured"}
            </StatusBadge>
          }
        >
          {driveProblems.length > 0 ? (
            <div className="mb-4">
              <p className="text-sm text-ink-secondary">
                Connecting Drive needs the following first:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {driveProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {driveAccounts.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Drive is not connected."
              description="This is a separate authorisation from YouTube. Connecting a channel does not hand over the media library, and disconnecting one does not take the other with it."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {driveAccounts.map((account) => (
                <li key={account.id}>
                  <AccountCard
                    account={account}
                    disconnectAction={disconnectGoogleDrive}
                  />
                </li>
              ))}
            </ul>
          )}

          <form action={connectGoogleDrive} className="mt-4">
            <button
              type="submit"
              disabled={!canConnectDrive}
              className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
            >
              {driveAccounts.length === 0
                ? "Connect Google Drive"
                : "Reconnect Google Drive"}
            </button>
          </form>

          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Google offers no folder-scoped read scope, so this asks for
            read-only access to your Drive and confines itself to the approved
            folder in application logic. Every listing and every read proves
            containment first. The connection cannot write, delete or change
            sharing on anything.
          </p>
        </SectionCard>

        <SectionCard
          title="TikTok"
          description="TikTok Login Kit with the Content Posting API."
          action={
            <StatusBadge tone={canConnectTikTok ? "configured" : "inactive"}>
              {canConnectTikTok ? "Ready to connect" : "Not configured"}
            </StatusBadge>
          }
        >
          {tiktokProblems.length > 0 ? (
            <div className="mb-4">
              <p className="text-sm text-ink-secondary">
                Connecting TikTok needs the following first:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                {tiktokProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {tiktokCapability ? (
            <div className="mb-4 rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-primary">
                Direct posting
                <StatusBadge
                  tone={tiktokDirectPost ? "configured" : "inactive"}
                >
                  {tiktokDirectPost ? "Available" : "Not available"}
                </StatusBadge>
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Connected is not the same as approved to post. A connection can
                be granted without the publish permission, and TikTok restricts
                an API client it has not audited to private posts — so this line
                is read from TikTok, for this account, rather than assumed from
                the fact that a connection exists.
              </p>
              {tiktokCapability.problems.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-muted">
                  {tiktokCapability.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              ) : null}
              {tiktokDirectPost &&
              tiktokCapability.privacyLevelOptions.length > 0 ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Audiences TikTok currently offers this account:{" "}
                  {tiktokCapability.privacyLevelOptions
                    .map((level) => PRIVACY_LEVEL_LABELS[level])
                    .join(", ")}
                  .
                </p>
              ) : null}
            </div>
          ) : null}

          {tiktokAccounts.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No TikTok account connected."
              description="Connecting sends you to TikTok to authorise this dashboard. It asks to identify the account, to upload to your drafts, and to post — nothing about comments, messages or analytics."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {tiktokAccounts.map((account) => (
                <li key={account.id}>
                  <AccountCard
                    account={account}
                    disconnectAction={disconnectTikTok}
                  />
                </li>
              ))}
            </ul>
          )}

          <form action={connectTikTok} className="mt-4">
            <button
              type="submit"
              disabled={!canConnectTikTok}
              className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-50"
            >
              {tiktokAccounts.length === 0
                ? "Connect TikTok"
                : "Reconnect TikTok"}
            </button>
          </form>

          <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-secondary">
            <li>
              <span className="font-medium text-ink-primary">
                Permissions requested
              </span>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {TIKTOK_SCOPES.map((scope) => (
                  <li
                    key={scope}
                    className="rounded border border-edge/70 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
                  >
                    {scope}
                  </li>
                ))}
              </ul>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Posting directly
              </span>
              <p className="mt-0.5 text-ink-muted">
                {DELIVERY_MODE_DETAIL.direct_post} The audience is chosen from
                the options TikTok returns for your own account, read fresh each
                time — this dashboard never offers one TikTok has not confirmed.
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Sending to drafts
              </span>
              <p className="mt-0.5 text-ink-muted">
                {DELIVERY_MODE_DETAIL.inbox}
              </p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                Media is streamed, never exposed
              </span>
              <p className="mt-0.5 text-ink-muted">{PULL_FROM_URL_REFUSAL}</p>
            </li>
            <li>
              <span className="font-medium text-ink-primary">
                The connection refreshes itself
              </span>
              <p className="mt-0.5 text-ink-muted">
                A TikTok access token lasts a day and is renewed automatically
                before each use. The refresh token lasts a year of inactivity —
                revoking this app in your TikTok settings ends it immediately,
                and reconnecting is the only way back.
              </p>
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          title="Analytics permissions"
          description="Separate from publishing. A connected account is not automatically a measurable one, and this table never conflates the two."
        >
          <ul className="flex flex-col gap-2.5">
            {analytics.readiness.map((entry) => {
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
                    <StatusBadge
                      tone={
                        entry.blockedBy === null
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
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
                    <div>
                      <dt className="text-ink-muted">Account connected</dt>
                      <dd className="text-ink-secondary">
                        {entry.accountConnected ? "Yes" : "No"}
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
                      <dt className="text-ink-muted">Analytics</dt>
                      <dd className="text-ink-secondary">
                        {entry.analyticsAuthorised
                          ? "Authorised"
                          : "Not authorised"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Last analytics sync</dt>
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
                    <p className="mt-2 text-[11px] leading-5 text-gold">
                      Latest analytics refresh failed
                      {entry.lastSync.error_category
                        ? ` (${entry.lastSync.error_category})`
                        : ""}
                      . Previously read figures are kept.
                    </p>
                  ) : null}

                  {entry.blockedBy ? (
                    <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                      {UNAVAILABLE_DETAIL[entry.blockedBy]}
                      {entry.action ? ` ${entry.action}` : ""}
                    </p>
                  ) : null}

                  {!entry.providerImplemented ? (
                    <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                      {capability.detail}
                    </p>
                  ) : null}

                  {entry.platform === "youtube" &&
                  entry.accountConnected &&
                  !entry.analyticsAuthorised ? (
                    <form action={grantYouTubeAnalytics} className="mt-3">
                      <button
                        type="submit"
                        className="rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                      >
                        Grant analytics permission
                      </button>
                      <p className="mt-1.5 text-[11px] leading-5 text-ink-muted">
                        This asks Google for read-only access to your YouTube
                        analytics — views, watch time and subscriber changes. It
                        is a separate permission from uploading, and your
                        publishing access is kept as it is. Nothing is recorded
                        until Google actually grants it.
                      </p>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </SectionCard>

        {unimplemented.length > 0 ? (
          <SectionCard
            title="Other platforms"
            description="Nothing is connected, and no adapter exists to connect it with."
          >
            <ul className="flex flex-col gap-2">
              {unimplemented.map((status) => (
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
                  <StatusBadge tone="coming-soon">Coming soon</StatusBadge>
                </li>
              ))}
            </ul>
          </SectionCard>
        ) : null}
      </div>
    </DashboardShell>
  );
}
