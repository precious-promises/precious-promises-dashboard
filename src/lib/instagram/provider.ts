import type { SupabaseClient } from "@supabase/supabase-js";

import {
  markNeedsReconnect,
  readStoredAccessToken,
  saveLongLivedConnection,
} from "@/lib/accounts/credentials";
import { needsRefresh, type SocialAccount } from "@/lib/accounts/types";
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
import { resolveMediaSource } from "@/lib/youtube/media-source";

import {
  createReelContainer,
  fetchContainerState,
  fetchMedia,
  publishContainer,
  uploadReelBytes,
  type InstagramRequestContext,
} from "./api";
import { canPublishMediaType, MEDIA_DELIVERY } from "./config";
import { InstagramApiError } from "./errors";
import { buildCaption, validateForInstagram } from "./metadata";
import { canPublish, refreshLongLivedToken } from "./oauth";
import {
  findContainer,
  loadInstagramMetadataAsWorker,
  recordContainer,
  recordPublished,
  updateContainerStatus,
} from "./repository";

/**
 * The Instagram publishing provider.
 *
 * ## What it publishes, and what it refuses
 *
 * **Reels only.** Meta's container publishing normally fetches media from a URL
 * its own servers must reach — which would mean exposing Dave's Drive files to
 * the open internet, or building an endpoint that serves them there. Reels have
 * a second path: a resumable container whose bytes are POSTed directly to
 * Meta. Images and carousels have no such path.
 *
 * So this provider uploads Reels as bytes and refuses images and carousels
 * with `media_source_unavailable`, saying why. Building a public media endpoint
 * to work around a platform limitation would be a genuinely new attack surface
 * traded for a format this product barely uses.
 *
 * ## A container is not a post
 *
 * Meta's publishing is two-phase. The container id that comes back from step
 * one is **not** proof of publication — only the media id from `media_publish`
 * is, and only that value is ever returned as `externalPostId`.
 *
 * The container is recorded before the publish call, which is what lets a
 * crashed worker ask Meta what happened instead of posting a second time.
 */

const PLATFORM = "instagram" as const;

export class InstagramProvider implements PublishingProvider {
  readonly platform = PLATFORM;

  async isConnected(): Promise<boolean> {
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

  async validateReadiness(
    request: PublishRequest,
  ): Promise<ReadinessProblem[]> {
    const problems: ReadinessProblem[] = [];

    const { client } = createWorkerClient();
    if (client === null) {
      return [
        {
          code: "provider_not_connected",
          message:
            "No trusted worker credential is configured, so Instagram cannot be reached.",
        },
      ];
    }

    const owner = request.variant.owner_id;
    const account = await this.findAccount(client, owner);

    if (account === null) {
      problems.push({
        code: "provider_not_connected",
        message: "No Instagram account is connected.",
      });
    } else if (account.status === "needs_reconnect") {
      problems.push({
        code: "provider_permission_revoked",
        message:
          "The connected Instagram account needs to be reconnected before anything can be published.",
      });
    } else if (!canPublish(account.granted_scopes)) {
      problems.push({
        code: "provider_permission_revoked",
        message:
          "The connection was granted without content-publishing permission, so nothing can be posted.",
      });
    }

    const metadata = await loadInstagramMetadataAsWorker(
      client,
      request.variant.id,
      owner,
    );

    problems.push(
      ...validateForInstagram({
        variant: request.variant,
        item: request.item,
        metadata,
      }),
    );

    // Only worth checking the file when the media type could be published at
    // all; otherwise the owner gets two refusals for one decision.
    if (metadata !== null && canPublishMediaType(metadata.media_type)) {
      const asset = await this.loadPrimaryVideoAsset(client, request);
      const source = await resolveMediaSource(asset);
      if (!source.available) {
        problems.push({
          code: source.error.code,
          message: source.error.message,
        });
      }
    }

    return problems;
  }

  async preparePayload(request: PublishRequest): Promise<unknown> {
    return {
      caption: buildCaption(request.variant, request.item),
    };
  }

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

    const owner = request.variant.owner_id;

    // 1. Has this operation already produced a post? Asked first, before
    //    anything else — this is the double-publish guard.
    const existing = await findContainer(client, request.idempotencyKey);
    if (existing?.status === "published" && existing.published_media_id) {
      return {
        outcome: "succeeded",
        externalPostId: existing.published_media_id,
        externalPostUrl: null,
      };
    }

    // 2. The account and its permissions.
    const account = await this.findAccount(client, owner);
    if (account === null) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_not_connected",
          "No Instagram account is connected.",
        ),
      };
    }
    if (account.status !== "connected") {
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The connected Instagram account needs to be reconnected.",
        ),
      };
    }
    if (!canPublish(account.granted_scopes)) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The connection was granted without content-publishing permission.",
        ),
      };
    }

    // 3. Settings, validated the same way the interface validates them.
    const metadata = await loadInstagramMetadataAsWorker(
      client,
      request.variant.id,
      owner,
    );
    const contentProblems = validateForInstagram({
      variant: request.variant,
      item: request.item,
      metadata,
    });

    if (metadata === null || contentProblems.length > 0) {
      const first = contentProblems[0];
      return {
        outcome: "failed",
        error: safeError(
          first?.code ?? "invalid_content",
          first?.message ?? "No Instagram settings have been saved.",
        ),
      };
    }

    if (!canPublishMediaType(metadata.media_type)) {
      return {
        outcome: "failed",
        error: safeError(
          "media_source_unavailable",
          MEDIA_DELIVERY[metadata.media_type].detail,
        ),
      };
    }

    // 4. The media, before any Meta request.
    const asset = await this.loadPrimaryVideoAsset(client, request);
    const media = await resolveMediaSource(asset);
    if (!media.available) {
      return { outcome: "failed", error: media.error };
    }

    // 5. Credentials.
    const token = await this.liveToken(client, account);
    if (token === null) {
      await markNeedsReconnect(client, account.id, owner);
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The stored Instagram authorisation could not be used or refreshed. Reconnect the account.",
        ),
      };
    }

    const context: InstagramRequestContext = { accessToken: token };
    const caption = buildCaption(request.variant, request.item);

    try {
      // 6. Create or resume the container.
      let containerRowId = existing?.id ?? null;
      let containerId = existing?.container_id ?? null;

      if (containerId === null) {
        containerId = await createReelContainer(context, {
          igUserId: account.provider_account_id,
          caption,
          shareToFeed: metadata.share_to_feed,
          fileSizeBytes: media.source.contentLength,
        });

        // Written before the bytes go, and long before the publish call. This
        // row is what stops a crashed worker posting twice.
        containerRowId = await recordContainer(client, {
          ownerId: owner,
          scheduledPostId: request.scheduledPost.id,
          idempotencyKey: request.idempotencyKey,
          containerId,
          mediaType: metadata.media_type,
        });

        await uploadReelBytes(context, containerId, await media.source.open(), {
          fileSizeBytes: media.source.contentLength,
        });
      }

      // 7. Wait for Meta to finish processing. A container that is not
      //    FINISHED cannot be published, and publishing one that errored fails
      //    in a way that reads like a different problem.
      const state = await fetchContainerState(context, containerId);

      if (state.status === "published") {
        // Meta already published it — a previous attempt got further than its
        // record shows. Reconcile rather than publish again.
        return await this.reconcileExisting(
          client,
          context,
          containerRowId,
          containerId,
        );
      }

      if (state.status === "error" || state.status === "expired") {
        if (containerRowId) {
          await updateContainerStatus(client, containerRowId, state.status);
        }
        return {
          outcome: "failed",
          error: safeError(
            "provider_rejected_media",
            `Meta reported the container as ${state.status}.`,
          ),
        };
      }

      if (state.status !== "finished") {
        // Still processing. Not a failure — the next run picks the container
        // up by its idempotency key rather than creating another.
        if (containerRowId) {
          await updateContainerStatus(client, containerRowId, "in_progress");
        }
        return {
          outcome: "incomplete",
          state: "uploaded_to_platform_draft",
          externalPostId: null,
          detail:
            "Meta is still processing the upload. It has not been published, and the next run will resume this same container rather than creating another.",
        };
      }

      if (containerRowId) {
        await updateContainerStatus(client, containerRowId, "finished");
      }

      // 8. Publish. Only this call produces something that proves a post.
      const mediaId = await publishContainer(
        context,
        account.provider_account_id,
        containerId,
      );

      if (containerRowId) {
        await recordPublished(client, containerRowId, mediaId);
      }

      // The permalink cannot be constructed from a media id, so it is read
      // back — and its absence does not make the publish any less real.
      const published = await fetchMedia(context, mediaId);

      return {
        outcome: "succeeded",
        externalPostId: mediaId,
        externalPostUrl: published?.permalink ?? null,
      };
    } catch (error) {
      return { outcome: "failed", error: this.classifyError(error) };
    }
  }

  /**
   * Look up a post this operation may already have created.
   *
   * Answerable only because the container is recorded before publishing.
   * Without that row there would be no way to ask, and the only safe behaviour
   * on an interrupted publish would be never to retry.
   */
  async reconcile(idempotencyKey: string): Promise<PublishSucceeded | null> {
    const { client } = createWorkerClient();
    if (client === null) {
      return null;
    }

    const container = await findContainer(client, idempotencyKey);
    if (container?.status === "published" && container.published_media_id) {
      return {
        outcome: "succeeded",
        externalPostId: container.published_media_id,
        externalPostUrl: null,
      };
    }

    return null;
  }

  classifyError(error: unknown): SafeError {
    if (error instanceof InstagramApiError) {
      return error.safe;
    }
    return classifyThrown(error);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async reconcileExisting(
    client: SupabaseClient,
    context: InstagramRequestContext,
    containerRowId: string | null,
    containerId: string,
  ): Promise<PublishResult> {
    // Meta says the container is published but this system has no media id for
    // it. There is no documented way to ask "which post did this container
    // become", so this reports an incomplete state rather than inventing an id
    // or claiming a success it cannot evidence.
    void containerId;

    if (containerRowId) {
      await updateContainerStatus(client, containerRowId, "in_progress");
    }

    return {
      outcome: "incomplete",
      state: "uploaded_to_platform_draft",
      externalPostId: null,
      detail:
        "Meta reports this container as already published, but returned no media id to record. The post likely exists — check the account before retrying, because retrying could publish a second copy.",
    };
  }

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

  /**
   * A usable access token, refreshed if it is close to expiry.
   *
   * Meta's model has no refresh token: the long-lived token refreshes itself.
   * A token that has *already* expired cannot be refreshed at all — that is a
   * reconnection, and returning null here is what triggers it.
   */
  private async liveToken(
    client: SupabaseClient,
    account: SocialAccount,
  ): Promise<string | null> {
    const stored = await readStoredAccessToken(client, account);
    if (stored === null) {
      return null;
    }

    if (!needsRefresh(stored.expiresAt)) {
      return stored.accessToken;
    }

    try {
      const refreshed = await refreshLongLivedToken(
        stored.accessToken,
        account.granted_scopes,
      );

      await saveLongLivedConnection(client, {
        ownerId: account.owner_id,
        platform: PLATFORM,
        providerAccountId: account.provider_account_id,
        displayName: account.display_name,
        handle: account.handle,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        grantedScopes: account.granted_scopes,
      });

      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

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
}

export const instagramProvider = new InstagramProvider();
