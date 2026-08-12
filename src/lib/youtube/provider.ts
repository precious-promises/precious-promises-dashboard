import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLiveCredential,
  markNeedsReconnect,
} from "@/lib/accounts/credentials";
import type { SocialAccount } from "@/lib/accounts/types";
import type { MediaAsset } from "@/lib/media/types";
import {
  classifyThrown,
  safeError,
  type SafeError,
} from "@/lib/publishing/errors";
import type {
  PublishingProvider,
  PublishRequest,
  PublishResult,
  PublishSucceeded,
  ReadinessProblem,
} from "@/lib/publishing/providers";
import { createWorkerClient } from "@/lib/supabase/worker";

import {
  addToPlaylist,
  fetchProcessingStatus,
  queryUploadStatus,
  setThumbnail,
  startResumableUpload,
  uploadMedia,
} from "./api";
import { PLAYLIST_SCOPE } from "./config";
import { YouTubeApiError } from "./errors";
import { resolveMediaSource, type MediaSource } from "./media-source";
import { buildVideoResource, validateForYouTube } from "./metadata";
import { canUpload } from "./oauth";
import {
  abandonUploadSession,
  completeUploadSession,
  findUploadSession,
  loadMetadataAsWorker,
  openSessionUri,
  recordBytesSent,
  recordUploadSession,
} from "./repository";
import { resolveYouTubeConfig } from "./server-config";
import { watchUrl, type YouTubeVideoMetadata } from "./types";

/**
 * The YouTube publishing provider — the first genuine external integration.
 *
 * ## What "genuine" means here
 *
 * Every call below is real. There is no stub, no simulated response and no
 * branch that reports success without a video id from YouTube. If the upload
 * happens, the id comes from YouTube; if it does not, this reports why.
 *
 * ## What Stage 8 changed
 *
 * Through Stage 7 the upload path stopped at `resolveMediaSource`, which
 * refused every asset because nothing could fetch a file. Stage 8 implemented
 * Google Drive retrieval, so a video stored in the approved Precious Promises
 * Content folder now resolves to real, streaming bytes and this provider can
 * genuinely upload it.
 *
 * That removed a blocker; it removed no safety. A file outside the approved
 * folder, in the bin, of an unsupported type, or in a provider with no adapter
 * is still refused — and inventing bytes remains the one thing this path will
 * never do.
 *
 * ## Order of operations
 *
 * Media is resolved **before** credentials are touched and before any request
 * reaches Google. An upload costs 1,600 quota units of a default 10,000 a day
 * — six uploads — so failing early on something knowable locally is worth
 * doing deliberately rather than by accident.
 */

const PLATFORM = "youtube" as const;

export class YouTubeProvider implements PublishingProvider {
  readonly platform = PLATFORM;

  /**
   * Whether a YouTube connection could act right now.
   *
   * Checks configuration and the existence of a connected account. This is a
   * single-owner dashboard, so "an account is connected" is unambiguous; a
   * multi-tenant version of this method would need the owner passed in.
   */
  async isConnected(): Promise<boolean> {
    const { config } = resolveYouTubeConfig();
    if (config === null) {
      return false;
    }

    const { client } = createWorkerClient();
    if (client === null) {
      return false;
    }

    const { data } = await client
      .from("social_accounts")
      .select("id")
      .eq("platform", PLATFORM)
      .eq("status", "connected")
      .limit(1);

    return (data ?? []).length > 0;
  }

  /**
   * Everything that would stop this publish, gathered at once.
   *
   * Returns problems rather than the first one, so the owner can fix a title,
   * a declaration and a missing file in one pass instead of three failed runs.
   */
  async validateReadiness(
    request: PublishRequest,
  ): Promise<ReadinessProblem[]> {
    const problems: ReadinessProblem[] = [];

    const { config, problems: configProblems } = resolveYouTubeConfig();
    if (config === null) {
      return configProblems.map((message) => ({
        code: "provider_not_connected" as const,
        message,
      }));
    }

    const { client } = createWorkerClient();
    if (client === null) {
      return [
        {
          code: "provider_not_connected",
          message:
            "No trusted worker credential is configured, so YouTube cannot be reached.",
        },
      ];
    }

    const account = await this.findAccount(client, request.variant.owner_id);
    if (account === null) {
      problems.push({
        code: "provider_not_connected",
        message: "No YouTube channel is connected.",
      });
    } else if (account.status === "needs_reconnect") {
      problems.push({
        code: "provider_permission_revoked",
        message:
          "The connected YouTube channel needs to be reconnected before anything can be uploaded.",
      });
    } else if (!canUpload(account.granted_scopes)) {
      problems.push({
        code: "provider_permission_revoked",
        message:
          "The connection was granted without upload permission, so nothing can be sent to this channel.",
      });
    }

    const metadata = await loadMetadataAsWorker(
      client,
      request.variant.id,
      request.variant.owner_id,
    );

    problems.push(
      ...validateForYouTube({
        variant: request.variant,
        item: request.item,
        metadata,
      }),
    );

    const media = await this.loadPrimaryVideoAsset(client, request);
    const source = await resolveMediaSource(media);
    if (!source.available) {
      problems.push({
        code: source.error.code,
        message: source.error.message,
      });
    }

    return problems;
  }

  /**
   * The request body, built and returned without sending it.
   *
   * Useful for showing the owner exactly what would be uploaded. It contains
   * no credential and cannot: the token is added as a header at the moment of
   * the call, by the API client, and never travels on a payload.
   */
  async preparePayload(request: PublishRequest): Promise<unknown> {
    const { client } = createWorkerClient();
    if (client === null) {
      return null;
    }

    const metadata = await loadMetadataAsWorker(
      client,
      request.variant.id,
      request.variant.owner_id,
    );

    if (metadata === null) {
      return null;
    }

    return buildVideoResource({
      variant: request.variant,
      item: request.item,
      metadata,
    });
  }

  /**
   * Attempt the publish.
   *
   * The generic safety gate has already run in the worker — approval,
   * fingerprint, Scripture verification, claim. What happens here is
   * YouTube-specific and, crucially, **reconciliation first**: if a previous
   * attempt of this same operation already got a video id out of YouTube, that
   * is the answer, and uploading again would publish twice.
   */
  async publish(request: PublishRequest): Promise<PublishResult> {
    const { client } = createWorkerClient();
    if (client === null) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_not_connected",
          "No trusted worker credential is configured.",
        ),
      };
    }

    const { config, problems } = resolveYouTubeConfig();
    if (config === null) {
      return {
        outcome: "failed",
        error: safeError("provider_not_connected", problems.join(" ")),
      };
    }

    const owner = request.variant.owner_id;

    // 1. Has this exact operation already succeeded? Ask before doing
    //    anything else — this is the double-publish guard.
    const existing = await findUploadSession(client, request.idempotencyKey);
    if (existing?.status === "completed" && existing.video_id) {
      return {
        outcome: "succeeded",
        externalPostId: existing.video_id,
        externalPostUrl: watchUrl(existing.video_id),
      };
    }

    // 2. The account and its permissions.
    const account = await this.findAccount(client, owner);
    if (account === null) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_not_connected",
          "No YouTube channel is connected.",
        ),
      };
    }
    if (account.status !== "connected") {
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The connected YouTube channel needs to be reconnected.",
        ),
      };
    }
    if (!canUpload(account.granted_scopes)) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The connection was granted without upload permission.",
        ),
      };
    }

    // 3. Metadata, validated the same way the interface validates it.
    const metadata = await loadMetadataAsWorker(
      client,
      request.variant.id,
      owner,
    );
    const contentProblems = validateForYouTube({
      variant: request.variant,
      item: request.item,
      metadata,
    });

    if (contentProblems.length > 0 || metadata === null) {
      const first = contentProblems[0];
      return {
        outcome: "failed",
        error: safeError(
          first?.code ?? "invalid_content",
          first?.message ?? "No YouTube settings have been saved.",
        ),
      };
    }

    // 4. The media. Deliberately before any Google request: an upload costs
    //    1,600 of 10,000 daily quota units, and there is nothing to spend it
    //    on if there are no bytes.
    const asset = await this.loadPrimaryVideoAsset(client, request);
    const media = await resolveMediaSource(asset);
    if (!media.available) {
      return { outcome: "failed", error: media.error };
    }

    // 5. Credentials, refreshed if needed.
    const credential = await getLiveCredential(client, account);
    if (!credential.ok) {
      if (credential.needsReconnect) {
        await markNeedsReconnect(client, account.id, owner);
      }
      return {
        outcome: "failed",
        error: safeError(
          credential.needsReconnect
            ? "provider_permission_revoked"
            : "provider_not_connected",
          credential.reason,
        ),
      };
    }

    const context = { accessToken: credential.credential.accessToken };

    try {
      const videoId = await this.uploadVideo({
        client,
        request,
        metadata,
        source: media.source,
        context,
        existingSessionId: existing?.status === "open" ? existing.id : null,
      });

      // 6. Everything from here is after the video exists. Each step is
      //    allowed to fail on its own: a rejected thumbnail does not turn a
      //    published video into an unpublished one, and saying otherwise
      //    would be as false as claiming a success that never happened.
      await this.applyThumbnail(client, request, metadata, context, videoId);
      await this.applyPlaylist(
        metadata,
        credential.credential.grantedScopes,
        context,
        videoId,
      );
      await this.recordProcessing(client, request, context, videoId);

      return {
        outcome: "succeeded",
        externalPostId: videoId,
        externalPostUrl: watchUrl(videoId),
      };
    } catch (error) {
      return { outcome: "failed", error: this.classifyError(error) };
    }
  }

  /**
   * Look up a video this operation may already have created.
   *
   * Answerable only because the upload session is written before the bytes are
   * sent. Without that record there would be no way to ask, and the only safe
   * behaviour on an interrupted upload would be to never retry at all.
   */
  async reconcile(idempotencyKey: string): Promise<PublishSucceeded | null> {
    const { client } = createWorkerClient();
    if (client === null) {
      return null;
    }

    const session = await findUploadSession(client, idempotencyKey);
    if (session?.status === "completed" && session.video_id) {
      return {
        outcome: "succeeded",
        externalPostId: session.video_id,
        externalPostUrl: watchUrl(session.video_id),
      };
    }

    return null;
  }

  /** Turn anything thrown into a category and a sentence. */
  classifyError(error: unknown): SafeError {
    if (error instanceof YouTubeApiError) {
      return error.safe;
    }
    return classifyThrown(error);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async findAccount(
    client: SupabaseClient,
    ownerId: string,
  ): Promise<SocialAccount | null> {
    const { data } = await client
      .from("social_accounts")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("platform", PLATFORM)
      .neq("status", "disconnected")
      .limit(1)
      .maybeSingle();

    return (data as SocialAccount | null) ?? null;
  }

  /** The video asset attached to this content item as its primary media. */
  private async loadPrimaryVideoAsset(
    client: SupabaseClient,
    request: PublishRequest,
  ): Promise<MediaAsset | null> {
    const { data: links } = await client
      .from("content_media")
      .select("media_asset_id, purpose, sort_order")
      .eq("content_item_id", request.item.id)
      .order("sort_order", { ascending: true });

    const primary = (
      (links ?? []) as { media_asset_id: string; purpose: string }[]
    ).find((link) => link.purpose === "primary");

    if (!primary) {
      return null;
    }

    const { data } = await client
      .from("media_assets")
      .select("*")
      .eq("id", primary.media_asset_id)
      .eq("owner_id", request.variant.owner_id)
      .maybeSingle();

    return (data as MediaAsset | null) ?? null;
  }

  /**
   * Send the video, resuming an interrupted session where one exists.
   *
   * The resume path asks YouTube what it already has rather than assuming.
   * `complete` means the video exists and its id comes straight back — which
   * is the case that would otherwise become a duplicate upload.
   */
  private async uploadVideo(input: {
    client: SupabaseClient;
    request: PublishRequest;
    metadata: YouTubeVideoMetadata;
    source: MediaSource;
    context: { accessToken: string };
    existingSessionId: string | null;
  }): Promise<string> {
    const { client, request, metadata, source, context } = input;

    if (input.existingSessionId !== null) {
      const uri = await openSessionUri(client, input.existingSessionId);

      if (uri !== null) {
        const status = await queryUploadStatus(uri, source.contentLength);

        if (status.state === "complete") {
          await completeUploadSession(
            client,
            input.existingSessionId,
            status.videoId,
          );
          return status.videoId;
        }

        if (status.state === "incomplete") {
          await recordBytesSent(
            client,
            input.existingSessionId,
            status.bytesReceived,
          );
        }
      }

      // The session is unusable — expired, or its URI could not be read.
      // Abandon it and open a fresh one rather than resuming into nothing.
      await abandonUploadSession(client, input.existingSessionId);
    }

    const resource = buildVideoResource({
      variant: request.variant,
      item: request.item,
      metadata,
    });

    const sessionUri = await startResumableUpload(
      context,
      resource,
      {
        contentLength: source.contentLength,
        contentType: source.contentType,
      },
      { notifySubscribers: metadata.notify_subscribers },
    );

    // Written before a single byte is sent. If this worker dies mid-upload,
    // this row is what stops the next one publishing a second copy.
    const sessionId = await recordUploadSession(client, {
      ownerId: request.variant.owner_id,
      scheduledPostId: request.scheduledPost.id,
      idempotencyKey: request.idempotencyKey,
      sessionUri,
      bytesTotal: source.contentLength,
    });

    const videoId = await uploadMedia(sessionUri, await source.open(), {
      contentLength: source.contentLength,
      contentType: source.contentType,
    });

    if (sessionId !== null) {
      await completeUploadSession(client, sessionId, videoId);
    }

    return videoId;
  }

  /**
   * Set the custom thumbnail, if one was chosen.
   *
   * Swallows its own failure by design — but only its own. The video is
   * published either way, and a thumbnail that YouTube rejected (too large,
   * wrong format, unverified channel) is a separate problem from the publish.
   */
  private async applyThumbnail(
    client: SupabaseClient,
    request: PublishRequest,
    metadata: YouTubeVideoMetadata,
    context: { accessToken: string },
    videoId: string,
  ): Promise<void> {
    if (metadata.thumbnail_media_asset_id === null) {
      return;
    }

    const { data } = await client
      .from("media_assets")
      .select("*")
      .eq("id", metadata.thumbnail_media_asset_id)
      .eq("owner_id", request.variant.owner_id)
      .maybeSingle();

    const asset = (data as MediaAsset | null) ?? null;
    if (asset === null) {
      return;
    }

    // The same wall the video hits: a thumbnail is a metadata record too, and
    // there is no integration that fetches its bytes.
    const source = await resolveMediaSource(asset, "image");
    if (!source.available) {
      return;
    }

    try {
      const body = await source.source.open();
      await setThumbnail(context, videoId, {
        bytes: body as unknown as Uint8Array,
        contentType: asset.mime_type ?? "image/jpeg",
      });
    } catch {
      // Recorded by the caller's attempt row as a published video; the
      // thumbnail simply did not take.
    }
  }

  /** File the video in a playlist, if one was chosen and scope allows it. */
  private async applyPlaylist(
    metadata: YouTubeVideoMetadata,
    grantedScopes: readonly string[],
    context: { accessToken: string },
    videoId: string,
  ): Promise<void> {
    if (metadata.playlist_id === null) {
      return;
    }

    // Upload-only cannot modify the channel. Attempting it would just be a
    // 403 with a misleading message.
    if (!grantedScopes.includes(PLAYLIST_SCOPE)) {
      return;
    }

    try {
      await addToPlaylist(context, metadata.playlist_id, videoId);
    } catch {
      // The video is published. Failing to file it is not failing to publish.
    }
  }

  /**
   * Ask YouTube what became of the upload and record it.
   *
   * **Uploaded is not published.** Recording only the upload would leave this
   * system asserting a video is live when YouTube may still be processing it,
   * or may have rejected it outright.
   */
  private async recordProcessing(
    client: SupabaseClient,
    request: PublishRequest,
    context: { accessToken: string },
    videoId: string,
  ): Promise<void> {
    try {
      const processing = await fetchProcessingStatus(context, videoId);

      await client
        .from("scheduled_posts")
        .update({
          external_processing_status: processing?.status ?? "uploaded",
          external_processing_checked_at: new Date().toISOString(),
        })
        .eq("id", request.scheduledPost.id)
        .eq("owner_id", request.variant.owner_id);
    } catch {
      await client
        .from("scheduled_posts")
        .update({
          external_processing_status: "uploaded",
          external_processing_checked_at: new Date().toISOString(),
        })
        .eq("id", request.scheduledPost.id)
        .eq("owner_id", request.variant.owner_id);
    }
  }
}

/** The single instance registered in the provider registry. */
export const youtubeProvider = new YouTubeProvider();
