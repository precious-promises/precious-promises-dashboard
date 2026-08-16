import { ListVideo } from "lucide-react";
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
import { CONNECTED_ACCOUNTS_PATH } from "@/config/navigation";

export const metadata: Metadata = {
  title: "YouTube & Playlists · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * The YouTube workspace.
 *
 * A read-only view over the Stage 7 connection: channel identity, readiness,
 * the channel's playlists, and the uploads **this dashboard itself
 * recorded**. It claims nothing the API does not provide — uploads made
 * outside this dashboard are not listed, and Shorts classification is
 * YouTube's decision after processing, so none is shown or invented.
 */

interface KnownUpload {
  scheduledPostId: string;
  externalPostId: string;
  postedAt: string | null;
  processing: ProcessingStatus | null;
  title: string | null;
  contentItemId: string | null;
  metadata: YouTubeVideoMetadata | null;
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

  // The uploads this dashboard recorded: posted schedules whose variant is a
  // YouTube variant, with their metadata and processing state.
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

  return (
    <DashboardShell
      title="YouTube & Playlists"
      pathname="/dashboard/youtube"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            YouTube &amp; Playlists
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            The connected channel, its playlists, and the uploads this dashboard
            has itself made. Everything here reads the Stage 7 connection —
            there is no second credential system.
          </p>
        </div>

        <SectionCard
          title="Channel"
          description="Identity and readiness of the connected channel."
          action={
            <StatusBadge tone={connected ? "configured" : "inactive"}>
              {connected ? "Connected" : "Not connected"}
            </StatusBadge>
          }
        >
          {account === null ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-6 text-ink-secondary">
                No YouTube channel is connected. Connecting happens on Connected
                Accounts, where the OAuth flow and its permissions are
                explained.
              </p>
              <Link
                href={CONNECTED_ACCOUNTS_PATH}
                className="inline-flex w-fit items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Open Connected Accounts
              </Link>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-muted">Channel</dt>
                <dd className="text-ink-primary">
                  {account.channel_title ?? account.display_name ?? "Unnamed"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Status</dt>
                <dd className="text-ink-secondary">{account.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Publishing</dt>
                <dd className="text-ink-secondary">
                  {connected ? "Authorised" : "Not authorised"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Analytics permission</dt>
                <dd className="text-ink-secondary">
                  {analytics.analyticsAuthorised
                    ? "Granted"
                    : "Not granted — a separate consent on Connected Accounts"}
                </dd>
              </div>
            </dl>
          )}
        </SectionCard>

        <SectionCard
          title="Playlists"
          description="The playlists the connected channel actually has, read live. Only these can be chosen for a video — free text could send an upload into a stranger's playlist."
        >
          {channelPlaylists.playlists.length === 0 ? (
            <p className="text-sm text-ink-muted">{channelPlaylists.reason}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {channelPlaylists.playlists.map((playlist) => (
                <li
                  key={playlist.id}
                  className="flex items-center justify-between rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <span className="text-sm font-medium text-ink-primary">
                    {playlist.title}
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {playlist.itemCount === null
                      ? "Item count not reported"
                      : `${playlist.itemCount} ${playlist.itemCount === 1 ? "video" : "videos"}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            A playlist is chosen per video in the Caption Studio&apos;s YouTube
            settings; adding happens at publish time through the existing upload
            path.
          </p>
        </SectionCard>

        <SectionCard
          title="Uploads this dashboard made"
          description="Posts published to YouTube through this system, with their recorded state. Uploads made outside this dashboard are not listed — the dashboard does not claim visibility it does not have."
        >
          {uploads.length === 0 ? (
            <EmptyState
              icon={ListVideo}
              title="Nothing has been uploaded yet."
              description="When a scheduled post publishes to YouTube, it appears here with its processing, privacy and playlist state."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {uploads.map((upload) => (
                <li
                  key={upload.scheduledPostId}
                  className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink-primary">
                      {upload.title ?? "Untitled upload"}
                    </span>
                    <span className="flex items-center gap-2">
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

                  <p className="mt-1 text-[11px] text-ink-muted">
                    Video id {upload.externalPostId}
                    {upload.postedAt
                      ? ` · posted ${new Date(upload.postedAt).toLocaleDateString("en-GB")}`
                      : ""}
                    {upload.metadata?.playlist_id
                      ? " · added to a playlist"
                      : " · no playlist chosen"}
                    {upload.metadata?.thumbnail_media_asset_id
                      ? " · custom thumbnail"
                      : " · no custom thumbnail"}
                  </p>

                  {upload.contentItemId ? (
                    <Link
                      href={`/dashboard/content/${upload.contentItemId}`}
                      className="mt-2 inline-flex items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3 py-1.5 text-[11px] font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                    >
                      Open the content item
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs leading-5 text-ink-muted">
            Shorts classification is decided by YouTube after processing, from
            the file&apos;s shape and length. No API field requests or reports
            it, so this dashboard does not claim it.
          </p>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
