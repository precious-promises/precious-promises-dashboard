import { Link2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
import { DRIVE_ROOT_NAME } from "@/lib/drive/config";
import { resolveDriveConfig } from "@/lib/drive/server-config";
import {
  LONG_LIVED_TOKEN_DAYS,
  MEDIA_DELIVERY,
  STORIES_SUPPORTED,
} from "@/lib/instagram/config";
import { resolveInstagramConfig } from "@/lib/instagram/server-config";
import { PROVIDER_STATUS } from "@/lib/publishing/providers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { loadTikTokCapability } from "@/lib/tiktok/capability";
import {
  DELIVERY_MODE_DETAIL,
  PRIVACY_LEVEL_LABELS,
  PULL_FROM_URL_REFUSAL,
  TIKTOK_SCOPES,
} from "@/lib/tiktok/config";
import { resolveTikTokConfig } from "@/lib/tiktok/server-config";
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

import {
  connectGoogleDrive,
  connectInstagram,
  connectTikTok,
  connectYouTube,
  disconnectGoogleDrive,
  disconnectInstagram,
  disconnectTikTok,
  disconnectYouTube,
  grantYouTubeAnalytics,
} from "./actions";

export const metadata: Metadata = {
  title: "Connected Accounts · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Notices, phrased so each one says what to do next.
 *
 * Nothing here echoes anything a provider sent back. Callback URLs and their
 * query strings can end up in browser history and referrer headers, so the
 * reason codes are this application's own vocabulary, mapped to text here.
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
    "Instagram disconnected and the stored credential deleted. Meta issues no revocation endpoint for this token type — remove this app under Instagram’s connected-apps settings if you also want it withdrawn there.",

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

function ConnectionProblems({
  problems,
  workerReady,
}: {
  problems: string[];
  workerReady: boolean;
}) {
  if (problems.length === 0 && workerReady) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-gold-dim/40 bg-gold/5 px-4 py-3">
      <p className="text-sm font-medium text-ink-secondary">
        This connection cannot start yet:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-ink-muted">
        {problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
        {workerReady ? null : (
          <li>
            No trusted server credential is configured, so encrypted credentials
            cannot be written.
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Connected Accounts.
 *
 * This is the control surface for real third-party authorisations. It keeps
 * four states separate: implemented, configured, connected and live capability.
 * A connection row never contains a token, and a successful OAuth connection
 * never proves that every downstream publishing or analytics capability is
 * available.
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
  const instagramAccounts = accounts.filter(
    (account) => account.platform === "instagram",
  );
  const driveAccounts = accounts.filter(
    (account) => account.platform === "google_drive",
  );
  const tiktokAccounts = accounts.filter(
    (account) => account.platform === "tiktok",
  );

  const { problems } = resolveYouTubeConfig();
  const { problems: instagramProblems } = resolveInstagramConfig();
  const { problems: driveProblems } = resolveDriveConfig();
  const { problems: tiktokProblems } = resolveTikTokConfig();
  const workerReady = isWorkerConfigured();

  const canConnect = problems.length === 0 && workerReady;
  const canConnectInstagram = instagramProblems.length === 0 && workerReady;
  const canConnectDrive = driveProblems.length === 0 && workerReady;
  const canConnectTikTok = tiktokProblems.length === 0 && workerReady;

  // Connected and "can post directly" are different questions. Direct posting
  // needs both permission and TikTok's current capability response.
  const tiktokCapability =
    tiktokAccounts.length > 0 ? await loadTikTokCapability() : null;
  const tiktokDirectPost =
    tiktokCapability?.availableModes.includes("direct_post") ?? false;

  const unimplemented = PROVIDER_STATUS.filter((status) => !status.implemented);
  const analytics = await loadAnalyticsOverview();

  const connectedCount = accounts.filter(
    (account) => account.status === "connected",
  ).length;
  const reconnectCount = accounts.filter(
    (account) => account.status === "needs_reconnect",
  ).length;
  const configuredServices = [
    canConnect,
    canConnectInstagram,
    canConnectDrive,
    canConnectTikTok,
  ].filter(Boolean).length;
  const measurablePlatforms = analytics.readiness.filter(
    (entry) => entry.analyticsAuthorised && entry.blockedBy === null,
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
                See exactly which services are configured, which accounts have
                granted access and which capabilities are genuinely available.
                Connection, publishing permission, analytics permission and live
                provider capability remain separate facts.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/analytics"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Analytics
              </Link>
              <Link
                href="/dashboard/drive"
                className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Drive Browser
              </Link>
            </div>
          </div>
        </section>

        {notice ? (
          <p
            role="status"
            className="rounded-xl border border-edge bg-panel-raised/55 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </p>
        ) : null}

        <section
          aria-label="Connection evidence metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Connected"
            value={connectedCount}
            detail="Account records currently connected"
          />
          <Metric
            label="Reconnect"
            value={reconnectCount}
            detail="Stored authorisations rejected by a provider"
          />
          <Metric
            label="Configured"
            value={`${configuredServices}/4`}
            detail="Services able to begin OAuth now"
          />
          <Metric
            label="Measurable"
            value={`${measurablePlatforms}/3`}
            detail="Publishing platforms with analytics available"
          />
          <Metric
            label="Credential writer"
            value={workerReady ? "Ready" : "Missing"}
            detail="Trusted server credential storage boundary"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Connection state model
            </p>
            <h3 className="mt-2 text-lg font-semibold text-ink-primary">
              Authorise first. Verify each capability separately.
            </h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Implemented", "An adapter exists in this codebase"],
                ["2", "Configured", "Required server settings are present"],
                [
                  "3",
                  "Connected",
                  "The provider granted an account authorisation",
                ],
                [
                  "4",
                  "Capable",
                  "The exact downstream action is currently allowed",
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
              <li>Implemented ≠ configured.</li>
              <li>Configured ≠ connected.</li>
              <li>Connected ≠ approved to publish every format.</li>
              <li>Publishing permission ≠ analytics permission.</li>
              <li>Drive connection ≠ publishing connection.</li>
              <li>Account identity rows never expose credentials.</li>
            </ul>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <SectionCard
            title="YouTube"
            description="Google OAuth 2.0 with the YouTube Data API v3."
            action={
              <StatusBadge tone={canConnect ? "configured" : "inactive"}>
                {canConnect ? "Ready to connect" : "Not configured"}
              </StatusBadge>
            }
          >
            <ConnectionProblems problems={problems} workerReady={workerReady} />

            {youtubeAccounts.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="No YouTube channel connected."
                description="Connecting sends you to Google to authorise this dashboard. It asks for permission to upload, read the channel and manage playlists."
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

            <div className="mt-5 border-t border-edge/70 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Platform limits
              </p>
              <ul className="mt-3 space-y-3 text-xs leading-5 text-ink-muted">
                <li>
                  Permissions requested:{" "}
                  {YOUTUBE_SCOPES.map(shortScopeName).join(", ")}.
                </li>
                <li>
                  One upload costs {QUOTA_COST.videosInsert} of a default{" "}
                  {DEFAULT_DAILY_QUOTA_UNITS.toLocaleString("en-GB")} daily
                  quota — about {UPLOADS_PER_DEFAULT_QUOTA} uploads.
                </li>
                <li>
                  Privacy requests are limited to{" "}
                  {REQUESTABLE_PRIVACY_STATUSES.join(" and ")}. Google may force
                  unaudited API uploads to private.
                </li>
                <li>{MEDIA_RETRIEVAL_DETAIL}</li>
              </ul>
            </div>
          </SectionCard>

          <SectionCard
            title="Instagram"
            description="Instagram API with Instagram Login for a professional Business or Creator account."
            action={
              <StatusBadge
                tone={canConnectInstagram ? "configured" : "inactive"}
              >
                {canConnectInstagram ? "Ready to connect" : "Not configured"}
              </StatusBadge>
            }
          >
            <ConnectionProblems
              problems={instagramProblems}
              workerReady={workerReady}
            />

            {instagramAccounts.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="No Instagram account connected."
                description="Connecting sends you to Instagram to identify the account and grant content-publishing permission."
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

            <div className="mt-5 border-t border-edge/70 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Platform limits
              </p>
              <ul className="mt-3 space-y-3 text-xs leading-5 text-ink-muted">
                <li>Reels: {MEDIA_DELIVERY.reels.detail}</li>
                <li>Images and carousels: {MEDIA_DELIVERY.image.detail}</li>
                {STORIES_SUPPORTED ? null : (
                  <li>
                    Stories are not implemented; they use the same URL-fetch
                    delivery boundary as images.
                  </li>
                )}
                <li>
                  Long-lived tokens last {LONG_LIVED_TOKEN_DAYS} days and are
                  refreshed when used. A completely unused connection can
                  expire.
                </li>
                <li>
                  Content publishing requires Meta App Review outside app-role
                  users.
                </li>
              </ul>
            </div>
          </SectionCard>

          <SectionCard
            title="Google Drive"
            description={`Read-only access to the approved ${DRIVE_ROOT_NAME} folder used as a media source.`}
            action={
              <StatusBadge tone={canConnectDrive ? "configured" : "inactive"}>
                {canConnectDrive ? "Ready to connect" : "Not configured"}
              </StatusBadge>
            }
          >
            <ConnectionProblems
              problems={driveProblems}
              workerReady={workerReady}
            />

            {driveAccounts.length === 0 ? (
              <EmptyState
                icon={Link2}
                title="Drive is not connected."
                description="Drive is a separate authorisation from YouTube. Connecting or disconnecting one does not grant or revoke the other."
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

            <p className="mt-4 border-t border-edge/70 pt-4 text-xs leading-5 text-ink-muted">
              Google provides no folder-scoped read permission, so the app asks
              for read-only Drive access and enforces the approved folder in
              application logic. It cannot write, delete or change sharing.
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
            <ConnectionProblems
              problems={tiktokProblems}
              workerReady={workerReady}
            />

            {tiktokCapability ? (
              <div className="mb-4 rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-primary">
                    Direct posting
                  </p>
                  <StatusBadge
                    tone={tiktokDirectPost ? "configured" : "inactive"}
                  >
                    {tiktokDirectPost ? "Available" : "Not available"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  Connected is not the same as approved to post directly. This
                  state comes from TikTok for this account rather than from the
                  existence of a connection row.
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
                    Audiences TikTok currently offers:{" "}
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
                description="Connecting asks TikTok to identify the account, upload to drafts and request direct-post permission. It does not request comments, messages or analytics."
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

            <div className="mt-5 border-t border-edge/70 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Platform limits
              </p>
              <ul className="mt-3 space-y-3 text-xs leading-5 text-ink-muted">
                <li>Permissions requested: {TIKTOK_SCOPES.join(", ")}.</li>
                <li>
                  Direct posting: {DELIVERY_MODE_DETAIL.direct_post} Audience
                  options are read from TikTok for the account.
                </li>
                <li>Draft delivery: {DELIVERY_MODE_DETAIL.inbox}</li>
                <li>{PULL_FROM_URL_REFUSAL}</li>
                <li>
                  Access tokens are renewed before use when possible; revoking
                  the app at TikTok ends the authorisation.
                </li>
              </ul>
            </div>
          </SectionCard>
        </section>

        <SectionCard
          title="Analytics permissions"
          description="Separate from publishing. A connected account is not automatically a measurable one."
        >
          <ul className="grid gap-3 xl:grid-cols-2">
            {analytics.readiness.map((entry) => {
              const capability = analyticsCapabilityFor(entry.platform);

              return (
                <li
                  key={entry.platform}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink-primary">
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

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2">
                      <dt className="text-ink-muted">Account</dt>
                      <dd className="mt-1 text-ink-secondary">
                        {entry.accountConnected ? "Connected" : "Not connected"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2">
                      <dt className="text-ink-muted">Publishing</dt>
                      <dd className="mt-1 text-ink-secondary">
                        {entry.publishingAuthorised
                          ? "Authorised"
                          : "Not authorised"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2">
                      <dt className="text-ink-muted">Analytics</dt>
                      <dd className="mt-1 text-ink-secondary">
                        {entry.analyticsAuthorised
                          ? "Authorised"
                          : "Not authorised"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/35 px-3 py-2">
                      <dt className="text-ink-muted">Last sync</dt>
                      <dd className="mt-1 text-ink-secondary">
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
                    <p className="mt-3 rounded-lg border border-gold-dim/40 bg-gold/5 px-3 py-2 text-[11px] leading-5 text-gold">
                      Latest analytics refresh failed
                      {entry.lastSync.error_category
                        ? ` (${entry.lastSync.error_category})`
                        : ""}
                      . Previously read figures are kept.
                    </p>
                  ) : null}

                  {entry.blockedBy ? (
                    <p className="mt-3 text-[11px] leading-5 text-ink-muted">
                      {UNAVAILABLE_DETAIL[entry.blockedBy]}
                      {entry.action ? ` ${entry.action}` : ""}
                    </p>
                  ) : null}

                  {!entry.providerImplemented ? (
                    <p className="mt-2 text-[11px] leading-5 text-ink-muted">
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
                        This asks Google for read-only YouTube analytics access.
                        Publishing permission remains unchanged, and nothing is
                        recorded until Google actually grants it.
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
            description="No connection is claimed where no adapter exists."
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
