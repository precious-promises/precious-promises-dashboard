import {
  BarChart3,
  CheckCircle2,
  ListVideo,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import type { SocialAccount } from "@/lib/accounts/types";
import { assessAnalyticsReadiness } from "@/lib/analytics/readiness";
import { loadSyncRuns } from "@/lib/analytics/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadChannelPlaylists } from "@/lib/youtube/channel";
import { PRIVACY_LABELS } from "@/lib/youtube/config";
import {
  PROCESSING_STATUS_LABELS,
  type ProcessingStatus,
  type YouTubeVideoMetadata,
} from "@/lib/youtube/types";
import {
  CONNECTED_ACCOUNTS_PATH,
  PUBLISH_QUEUE_PATH,
} from "@/config/navigation";

export const metadata: Metadata = {
  title: "YouTube & Playlists · Precious Promises",
  robots: { index: false, follow: false },
};

interface KnownUpload {
  scheduledPostId: string;
  externalPostId: string;
  postedAt: string | null;
  processing: ProcessingStatus | null;
  title: string | null;
  contentItemId: string | null;
  metadata: YouTubeVideoMetadata | null;
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof ListVideo;
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

export default async function YouTubeWorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const accounts = await loadSocialAccounts();
  const account =
    accounts.find(
      (candidate: SocialAccount) =>
        candidate.platform === "youtube" && candidate.status !== "disconnected",
    ) ?? null;

  const connected = account !== null && account.status === "connected";

  const runs = await loadSyncRuns();
  const analytics = assessAnalyticsReadiness({
    platform: "youtube",
    account,
    publishingAuthorised: connected,
    runs,
  });

  const channelPlaylists = connected
    ? await loadChannelPlaylists(user.id)
    : {
        playlists: [],
        reason:
          "No YouTube channel is connected, so there are no playlists to read.",
      };

  const { data: postRows } = await supabase
    .from("scheduled_posts")
    .select(
      "id, platform_variant_id, external_post_id, posted_at, external_processing_status",
    )
    .eq("owner_id", user.id)
    .eq("status", "posted")
    .not("external_post_id", "is", null)
    .order("posted_at", { ascending: false });

  const posts = (postRows ?? []) as {
    id: string;
    platform_variant_id: string;
    external_post_id: string;
    posted_at: string | null;
    external_processing_status: ProcessingStatus | null;
  }[];

  const variantIds = posts.map((post) => post.platform_variant_id);
  const { data: variantRows } = variantIds.length
    ? await supabase
        .from("platform_variants")
        .select("id, platform, title, content_item_id")
        .eq("owner_id", user.id)
        .in("id", variantIds)
    : { data: [] };

  const variants = (variantRows ?? []) as {
    id: string;
    platform: string;
    title: string | null;
    content_item_id: string;
  }[];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const youtubeVariantIds = variants
    .filter((variant) => variant.platform === "youtube")
    .map((variant) => variant.id);

  const { data: metadataRows } = youtubeVariantIds.length
    ? await supabase
        .from("youtube_video_metadata")
        .select("*")
        .eq("owner_id", user.id)
        .in("platform_variant_id", youtubeVariantIds)
    : { data: [] };

  const metadataByVariant = new Map(
    ((metadataRows ?? []) as YouTubeVideoMetadata[]).map((row) => [
      row.platform_variant_id,
      row,
    ]),
  );

  const uploads: KnownUpload[] = posts
    .filter(
      (post) =>
        variantById.get(post.platform_variant_id)?.platform === "youtube",
    )
    .map((post) => {
      const variant = variantById.get(post.platform_variant_id);
      return {
        scheduledPostId: post.id,
        externalPostId: post.external_post_id,
        postedAt: post.posted_at,
        processing: post.external_processing_status,
        title: variant?.title ?? null,
        contentItemId: variant?.content_item_id ?? null,
        metadata: variant ? (metadataByVariant.get(variant.id) ?? null) : null,
      };
    });

  const processedUploads = uploads.filter(
    (upload) => upload.processing === "processed",
  ).length;
  const playlistAssignedUploads = uploads.filter(
    (upload) => upload.metadata?.playlist_id,
  ).length;

  return (
    <DashboardShell
      title="YouTube & Playlists"
      pathname="/dashboard/youtube"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(255,73,73,0.15),transparent_35%),linear-gradient(135deg,rgba(12,20,42,0.96),rgba(7,11,22,0.96))] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-highlight/30 bg-highlight/10 px-3 py-1 text-xs font-medium text-highlight-soft">
                <Sparkles className="size-3.5" aria-hidden="true" />
                YouTube command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                YouTube &amp; Playlists
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Inspect the connected channel, its live-read playlists and only
                the uploads this dashboard itself recorded. No external upload,
                Shorts classification or playlist state is inferred.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={CONNECTED_ACCOUNTS_PATH}
                className="rounded-lg border border-edge-strong bg-panel-raised/70 px-4 py-2 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Connected Accounts
              </Link>
              <Link
                href={PUBLISH_QUEUE_PATH}
                className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Publish Queue
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Channel"
            value={connected ? "1" : "0"}
            note={connected ? "YouTube account currently connected." : "No connected YouTube account."}
            icon={connected ? CheckCircle2 : WifiOff}
          />
          <Metric
            label="Playlists"
            value={channelPlaylists.playlists.length}
            note="Playlists returned from the connected channel read."
            icon={ListVideo}
          />
          <Metric
            label="Recorded Uploads"
            value={uploads.length}
            note="YouTube posts this dashboard itself recorded as posted."
            icon={UploadCloud}
          />
          <Metric
            label="Processed"
            value={processedUploads}
            note="Recorded uploads whose processing state is confirmed processed."
            icon={PlaySquare}
          />
          <Metric
            label="Playlist Assigned"
            value={playlistAssignedUploads}
            note="Recorded uploads with stored playlist metadata."
            icon={BarChart3}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <SectionCard
            title="Channel readiness"
            description="Identity, publishing consent and analytics permission remain separate states."
            action={
              <StatusBadge tone={connected ? "configured" : "inactive"}>
                {connected ? "Connected" : "Not connected"}
              </StatusBadge>
            }
          >
            {account === null ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-6 text-ink-secondary">
                  No YouTube channel is connected. Connecting happens on
                  Connected Accounts, where OAuth permissions are explained.
                </p>
                <Link
                  href={CONNECTED_ACCOUNTS_PATH}
                  className="inline-flex w-fit items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Open Connected Accounts
                </Link>
              </div>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 p-3">
                  <dt className="text-xs text-ink-muted">Channel</dt>
                  <dd className="mt-1 text-sm font-medium text-ink-primary">
                    {account.channel_title ?? account.display_name ?? "Unnamed"}
                  </dd>
                </div>
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 p-3">
                  <dt className="text-xs text-ink-muted">Account status</dt>
                  <dd className="mt-1 text-sm text-ink-secondary">{account.status}</dd>
                </div>
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 p-3">
                  <dt className="text-xs text-ink-muted">Publishing</dt>
                  <dd className="mt-1 text-sm text-ink-secondary">
                    {connected ? "Authorised" : "Not authorised"}
                  </dd>
                </div>
                <div className="rounded-xl border border-edge/70 bg-panel-raised/40 p-3">
                  <dt className="text-xs text-ink-muted">Analytics permission</dt>
                  <dd className="mt-1 text-sm text-ink-secondary">
                    {analytics.analyticsAuthorised
                      ? "Granted"
                      : "Not granted — requires separate consent"}
                  </dd>
                </div>
              </dl>
            )}
          </SectionCard>

          <SectionCard
            title="Channel playlists"
            description="Only playlists returned for the connected channel are shown or selectable downstream."
            action={
              <StatusBadge tone={connected ? "accent" : "inactive"}>
                {channelPlaylists.playlists.length}
              </StatusBadge>
            }
          >
            {channelPlaylists.playlists.length === 0 ? (
              <p className="text-sm text-ink-muted">{channelPlaylists.reason}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {channelPlaylists.playlists.map((playlist) => (
                  <li
                    key={playlist.id}
                    className="rounded-xl border border-edge/70 bg-panel-raised/40 px-3.5 py-3"
                  >
                    <p className="text-sm font-medium text-ink-primary">
                      {playlist.title}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {playlist.itemCount === null
                        ? "Item count not reported"
                        : `${playlist.itemCount} ${playlist.itemCount === 1 ? "video" : "videos"}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Playlist selection is stored per YouTube video and applied through
              the existing publish path. Free-text playlist IDs are not invented
              here.
            </p>
          </SectionCard>
        </div>

        <SectionCard
          title="Uploads this dashboard recorded"
          description="Only successful YouTube publications represented by this dashboard's own stored post rows are listed."
        >
          {uploads.length === 0 ? (
            <EmptyState
              icon={ListVideo}
              title="Nothing has been uploaded yet."
              description="When this system records a successful YouTube publication with a platform video id, it appears here with its processing and metadata state."
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {uploads.map((upload) => (
                <li
                  key={upload.scheduledPostId}
                  className="rounded-2xl border border-edge/70 bg-panel-raised/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-primary">
                        {upload.title ?? "Untitled upload"}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Video id {upload.externalPostId}
                      </p>
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      {upload.metadata ? (
                        <StatusBadge tone="inactive">
                          {PRIVACY_LABELS[upload.metadata.privacy_status]}
                        </StatusBadge>
                      ) : null}
                      <StatusBadge
                        tone={
                          upload.processing === "processed"
                            ? "configured"
                            : "accent"
                        }
                      >
                        {upload.processing
                          ? PROCESSING_STATUS_LABELS[upload.processing]
                          : "Processing state not checked"}
                      </StatusBadge>
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-edge/60 bg-panel/40 p-2.5">
                      <dt className="text-ink-muted">Posted</dt>
                      <dd className="mt-0.5 text-ink-secondary">
                        {upload.postedAt
                          ? new Date(upload.postedAt).toLocaleDateString("en-GB")
                          : "No timestamp recorded"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/40 p-2.5">
                      <dt className="text-ink-muted">Playlist</dt>
                      <dd className="mt-0.5 text-ink-secondary">
                        {upload.metadata?.playlist_id ? "Assigned" : "Not assigned"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/40 p-2.5">
                      <dt className="text-ink-muted">Thumbnail</dt>
                      <dd className="mt-0.5 text-ink-secondary">
                        {upload.metadata?.thumbnail_media_asset_id
                          ? "Custom thumbnail"
                          : "No custom thumbnail"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-edge/60 bg-panel/40 p-2.5">
                      <dt className="text-ink-muted">Shorts</dt>
                      <dd className="mt-0.5 text-ink-secondary">Not inferred</dd>
                    </div>
                  </dl>

                  {upload.contentItemId ? (
                    <Link
                      href={`/dashboard/content/${upload.contentItemId}`}
                      className="mt-3 inline-flex items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                    >
                      Open content item
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="rounded-2xl border border-edge bg-panel/55 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                YouTube truth boundary
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                A built YouTube integration is not the same as a connected
                channel. A connected channel is not the same as analytics
                permission. A scheduled item is not an upload. An upload is only
                shown here when this dashboard has stored the platform&apos;s own
                video id. Shorts classification remains YouTube&apos;s decision and
                is never inferred by this workspace.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
