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
  resolveMediaSource,
  type MediaSource,
} from "@/lib/youtube/media-source";

import {
  fetchCreatorInfo,
  fetchPublishStatus,
  initDirectPost,
  initInboxUpload,
  uploadChunk,
  type InitResult,
  type TikTokRequestContext,
} from "./api";
import { chunkRange, planChunks, type DeliveryMode } from "./config";
import { TikTokApiError } from "./errors";
import {
  buildCaption,
  validateAgainstCreator,
  validateForTikTok,
} from "./metadata";
import { canDirectPost, canUploadToDrafts } from "./oauth";
import {
  findSession,
  loadTikTokMetadataAsWorker,
  openUploadUrl,
  recordChunksSent,
  recordPublished,
  recordSession,
  recordUploadedToDraft,
  updateSessionStatus,
} from "./repository";
import { mapPublishStatus, postUrl, type PublishStatus } from "./types";

/**
 * The TikTok publishing provider.
 *
 * ## Three genuinely different outcomes
 *
 * TikTok is the first platform here where "it worked" has more than one
 * meaning, so the provider keeps them apart rather than flattening them:
 *
 * - **`direct_post`** creates a real, visible TikTok post. It needs the
 *   `video.publish` scope, and — because TikTok restricts an unaudited client
 *   to `SELF_ONLY` — an audience the creator's own account actually offers.
 *   Only this mode can ever return `succeeded`.
 * - **`inbox`** puts the video in the creator's TikTok drafts. Dave finishes
 *   and posts it in the app. This is reported as `incomplete` with
 *   `uploaded_to_platform_draft`, because **a draft is not a post** — and the
 *   database refuses an inbox session that claims otherwise.
 * - **`manual`** sends nothing to TikTok at all. The caption and settings are
 *   prepared and the item is reported as `ready_for_manual_post`.
 *
 * ## Why the session row exists
 *
 * TikTok's flow is initialise → upload chunks → poll a separate status
 * endpoint. By the time the last chunk lands, TikTok has the media and may
 * already be publishing it. A worker that died in that window and simply
 * retried would produce a **second post**.
 *
 * So the session is written the moment `publish_id` is known, before a single
 * byte is sent, and every attempt starts by asking TikTok what became of the
 * publish it already has. That is the whole double-publish guard.
 *
 * ## What is never inferred
 *
 * A post id comes from TikTok's status response and nowhere else. An
 * unrecognised status maps to `processing`, never success — see
 * `mapPublishStatus`. There is no code path in this file that produces a post
 * id this system was not given.
 */

const PLATFORM = "tiktok" as const;

export class TikTokProvider implements PublishingProvider {
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
            "No trusted worker credential is configured, so TikTok cannot be reached.",
        },
      ];
    }

    const owner = request.variant.owner_id;
    const metadata = await loadTikTokMetadataAsWorker(
      client,
      request.variant.id,
      owner,
    );

    problems.push(
      ...validateForTikTok({
        variant: request.variant,
        item: request.item,
        metadata,
      }),
    );

    const mode: DeliveryMode = metadata?.delivery_mode ?? "inbox";

    // Manual posting needs no account, no scope and no upload — it is the
    // fallback for exactly the case where those are missing.
    if (mode === "manual") {
      return problems;
    }

    const account = await this.findAccount(client, owner);

    if (account === null) {
      problems.push({
        code: "provider_not_connected",
        message: "No TikTok account is connected.",
      });
    } else if (account.status === "needs_reconnect") {
      problems.push({
        code: "provider_permission_revoked",
        message:
          "The connected TikTok account needs to be reconnected before anything can be sent.",
      });
    } else {
      const scopeProblem = this.scopeProblemFor(mode, account.granted_scopes);
      if (scopeProblem !== null) {
        problems.push(scopeProblem);
      }
    }

    const asset = await this.loadPrimaryVideoAsset(client, request);
    const source = await resolveMediaSource(asset);
    if (!source.available) {
      problems.push({
        code: source.error.code,
        message: source.error.message,
      });
    } else if (planChunks(source.source.contentLength) === null) {
      problems.push({
        code: "invalid_content",
        message:
          "This video cannot be split into chunks TikTok will accept. It is either empty or too large for the documented upload limits.",
      });
    }

    // The creator check needs a live call, so it only runs when there is a
    // connected account to make it with. A failure here is reported rather than
    // swallowed — an audience TikTok will refuse is better known now.
    if (mode === "direct_post" && metadata !== null && account !== null) {
      const token = await this.liveToken(client, account);
      if (token !== null) {
        try {
          const creator = await fetchCreatorInfo({ accessToken: token });
          problems.push(...validateAgainstCreator(metadata, creator));
        } catch (error) {
          problems.push({
            code: this.classifyError(error).code,
            message:
              "TikTok could not confirm what this account is allowed to post, so a direct post cannot be verified as safe.",
          });
        }
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

    // 1. Settings first. They decide whether anything is sent to TikTok at all.
    const metadata = await loadTikTokMetadataAsWorker(
      client,
      request.variant.id,
      owner,
    );

    const contentProblems = validateForTikTok({
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
          first?.message ?? "No TikTok settings have been saved.",
        ),
      };
    }

    const caption = buildCaption(request.variant, request.item);

    // 2. Manual posting sends nothing. It is a real outcome, not a failure —
    //    and reporting it as success would claim a post that does not exist.
    if (metadata.delivery_mode === "manual") {
      return {
        outcome: "incomplete",
        state: "ready_for_manual_post",
        externalPostId: null,
        detail:
          "This variant is set to manual posting. The caption and settings are ready to copy, and nothing has been sent to TikTok.",
      };
    }

    const mode: "direct_post" | "inbox" = metadata.delivery_mode;

    // 3. Has this operation already reached TikTok? Asked before anything else
    //    is attempted — this is the double-publish guard.
    const existing = await findSession(client, request.idempotencyKey);
    if (existing !== null && existing.delivery_mode !== mode) {
      // The mode changed after an upload was already opened. Continuing would
      // reconcile a draft as a post, or the reverse.
      return {
        outcome: "failed",
        error: safeError(
          "invalid_content",
          "The TikTok delivery mode changed after this upload was started. Re-approve the item so a fresh upload is opened rather than reusing one that meant something different.",
        ),
      };
    }

    // 4. Account and scopes.
    const account = await this.findAccount(client, owner);
    if (account === null) {
      return {
        outcome: "failed",
        error: safeError(
          "provider_not_connected",
          "No TikTok account is connected.",
        ),
      };
    }
    if (account.status !== "connected") {
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The connected TikTok account needs to be reconnected.",
        ),
      };
    }

    const scopeProblem = this.scopeProblemFor(mode, account.granted_scopes);
    if (scopeProblem !== null) {
      return {
        outcome: "failed",
        error: safeError(scopeProblem.code, scopeProblem.message),
      };
    }

    // 5. Credentials. TikTok's access token lasts a day, so a refresh on the
    //    way to a publish is the normal case, not the exception.
    const token = await this.liveToken(client, account);
    if (token === null) {
      await markNeedsReconnect(client, account.id, owner);
      return {
        outcome: "failed",
        error: safeError(
          "provider_permission_revoked",
          "The stored TikTok authorisation could not be used or refreshed. Reconnect the account.",
        ),
      };
    }

    const context: TikTokRequestContext = { accessToken: token };

    try {
      // 6. An existing session means TikTok already has a publish id. Resume it
      //    rather than starting a second one — a second `init` for a direct
      //    post is a second post.
      if (existing !== null) {
        // An upload that never finished is resumed from where it stopped. The
        // alternative — polling a status for bytes TikTok never received —
        // would report "still processing" forever.
        const remaining =
          (existing.total_chunk_count ?? 0) - existing.chunks_sent;

        if (
          remaining > 0 &&
          existing.chunk_size_bytes !== null &&
          existing.total_chunk_count !== null &&
          existing.video_size_bytes !== null
        ) {
          const uploadUrl = await openUploadUrl(client, existing.id);
          if (uploadUrl === null) {
            // Without the upload URL the bytes cannot be delivered, and TikTok
            // will expire the publish on its own. Failing here is honest; the
            // next approval opens a fresh session.
            await updateSessionStatus(client, existing.id, "expired");
            return {
              outcome: "failed",
              error: safeError(
                "unknown",
                "This TikTok upload was interrupted and its upload URL can no longer be read, so it cannot be resumed. Re-approve the item to start a fresh upload.",
              ),
            };
          }

          const asset = await this.loadPrimaryVideoAsset(client, request);
          const media = await resolveMediaSource(asset);
          if (!media.available) {
            return { outcome: "failed", error: media.error };
          }

          await this.sendChunks(
            client,
            existing.id,
            uploadUrl,
            media.source,
            {
              chunkSize: existing.chunk_size_bytes,
              totalChunks: existing.total_chunk_count,
            },
            existing.chunks_sent,
          );
        }

        return await this.resolveExistingSession(
          client,
          context,
          existing.id,
          existing.publish_id,
          mode,
          account,
        );
      }

      // 7. The media, before any TikTok request.
      const asset = await this.loadPrimaryVideoAsset(client, request);
      const media = await resolveMediaSource(asset);
      if (!media.available) {
        return { outcome: "failed", error: media.error };
      }

      const plan = planChunks(media.source.contentLength);
      if (plan === null) {
        return {
          outcome: "failed",
          error: safeError(
            "invalid_content",
            "This video cannot be split into chunks TikTok will accept.",
          ),
        };
      }

      // 8. For a direct post, confirm the audience against what TikTok says
      //    this creator may use — before uploading a whole video that would be
      //    refused at the last step.
      if (mode === "direct_post") {
        const creator = await fetchCreatorInfo(context);
        const creatorProblems = validateAgainstCreator(metadata, creator);
        if (creatorProblems.length > 0) {
          const first = creatorProblems[0];
          return {
            outcome: "failed",
            error: safeError(first.code, first.message),
          };
        }
      }

      const source: InitResult =
        mode === "direct_post"
          ? await initDirectPost(
              context,
              {
                title: caption,
                // Non-null: validateForTikTok refuses a direct post without one
                // and validateAgainstCreator has just confirmed TikTok offers it.
                privacyLevel: metadata.privacy_level!,
                disableComment: metadata.disable_comment,
                disableDuet: metadata.disable_duet,
                disableStitch: metadata.disable_stitch,
                brandContentToggle: metadata.is_branded_content,
                brandOrganicToggle: metadata.is_your_brand,
              },
              {
                videoSizeBytes: media.source.contentLength,
                chunkSizeBytes: plan.chunkSize,
                totalChunkCount: plan.totalChunks,
              },
            )
          : await initInboxUpload(context, {
              videoSizeBytes: media.source.contentLength,
              chunkSizeBytes: plan.chunkSize,
              totalChunkCount: plan.totalChunks,
            });

      // 9. Record before a byte is sent. TikTok has allocated a publish id by
      //    now; losing it here is what would cause a duplicate post later.
      const sessionId = await recordSession(client, {
        ownerId: owner,
        scheduledPostId: request.scheduledPost.id,
        idempotencyKey: request.idempotencyKey,
        publishId: source.publishId,
        deliveryMode: mode,
        uploadUrl: source.uploadUrl,
        videoSizeBytes: media.source.contentLength,
        chunkSizeBytes: plan.chunkSize,
        totalChunkCount: plan.totalChunks,
      });

      if (sessionId === null) {
        // Refusing to upload is the safe direction. An upload whose publish id
        // was never recorded cannot be reconciled, and a retry of it would post
        // twice.
        return {
          outcome: "failed",
          error: safeError(
            "unknown",
            "The TikTok upload session could not be recorded, so no video was sent. Without that record a retry could post the same video twice.",
          ),
        };
      }

      // 10. The bytes.
      await this.sendChunks(
        client,
        sessionId,
        source.uploadUrl,
        media.source,
        plan,
      );

      // 11. Ask TikTok what it did with them.
      return await this.resolveExistingSession(
        client,
        context,
        sessionId,
        source.publishId,
        mode,
        account,
      );
    } catch (error) {
      return { outcome: "failed", error: this.classifyError(error) };
    }
  }

  /**
   * Look up a post this operation may already have created.
   *
   * Answerable only because the session is recorded before the upload. Reports
   * a success **only** for a direct post that TikTok has confirmed with a post
   * id: an inbox upload has nothing to reconcile as a publication, however far
   * it got.
   */
  async reconcile(idempotencyKey: string): Promise<PublishSucceeded | null> {
    const { client } = createWorkerClient();
    if (client === null) {
      return null;
    }

    const session = await findSession(client, idempotencyKey);
    if (
      session?.status === "published" &&
      session.delivery_mode === "direct_post" &&
      session.external_post_id
    ) {
      return {
        outcome: "succeeded",
        externalPostId: session.external_post_id,
        externalPostUrl: null,
      };
    }

    // Nothing recorded as published locally. Ask TikTok, because the gap
    // between its upload finishing and this system hearing about it is exactly
    // where a worker dies.
    if (session === null || session.delivery_mode !== "direct_post") {
      return null;
    }

    const account = await this.findAccount(client, session.owner_id);
    if (account === null) {
      return null;
    }

    const token = await this.liveToken(client, account);
    if (token === null) {
      return null;
    }

    try {
      const status = await fetchPublishStatus(
        { accessToken: token },
        session.publish_id,
      );
      const mapped = mapPublishStatus(status.status, "direct_post");
      const postId = status.postIds[0] ?? null;

      if (mapped === "published" && postId !== null) {
        await recordPublished(client, session.id, postId);
        return {
          outcome: "succeeded",
          externalPostId: postId,
          externalPostUrl: postUrl(account.handle, postId),
        };
      }
    } catch {
      // A reconciliation that cannot reach TikTok reports nothing rather than
      // guessing. The caller treats that as "still unknown", which is true.
      return null;
    }

    return null;
  }

  classifyError(error: unknown): SafeError {
    if (error instanceof TikTokApiError) {
      return error.safe;
    }
    return classifyThrown(error);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Send the video, one chunk at a time.
   *
   * Each chunk is read as its own range from Drive rather than sliced out of a
   * buffered file, so a large video is never held in memory in one piece. The
   * count is written back after every chunk, which is what lets an interrupted
   * upload resume from the next chunk rather than resending the whole video —
   * and what lets its state be described honestly rather than as "somewhere
   * between nothing and everything".
   *
   * `from` is the resume point. Zero on a fresh upload.
   */
  private async sendChunks(
    client: SupabaseClient,
    sessionId: string,
    uploadUrl: string,
    source: MediaSource,
    plan: { chunkSize: number; totalChunks: number },
    from = 0,
  ): Promise<void> {
    await updateSessionStatus(client, sessionId, "uploading");

    for (let index = from; index < plan.totalChunks; index += 1) {
      const { start, end } = chunkRange(
        index,
        plan.chunkSize,
        plan.totalChunks,
        source.contentLength,
      );

      const body =
        plan.totalChunks === 1
          ? await source.open()
          : await source.openRange(start, end);

      await uploadChunk({
        uploadUrl,
        body,
        contentType: source.contentType,
        start,
        end,
        totalBytes: source.contentLength,
      });

      await recordChunksSent(client, sessionId, index + 1);
    }
  }

  /**
   * Ask TikTok what became of a publish, and record the answer.
   *
   * The one place a `succeeded` can come from, and it requires two things at
   * once: a status that maps to `published`, **and** a post id TikTok actually
   * returned. Either alone proves nothing.
   */
  private async resolveExistingSession(
    client: SupabaseClient,
    context: TikTokRequestContext,
    sessionId: string,
    publishId: string,
    mode: "direct_post" | "inbox",
    account: SocialAccount,
  ): Promise<PublishResult> {
    const status = await fetchPublishStatus(context, publishId);
    const mapped: PublishStatus = mapPublishStatus(status.status, mode);
    const postId = status.postIds[0] ?? null;

    if (mapped === "failed") {
      await updateSessionStatus(client, sessionId, "failed", status.failReason);
      return {
        outcome: "failed",
        error: safeError(
          "provider_rejected_media",
          status.failReason
            ? `TikTok rejected the video: ${status.failReason}.`
            : "TikTok rejected the video without giving a reason.",
        ),
      };
    }

    if (mapped === "uploaded_to_draft") {
      await recordUploadedToDraft(client, sessionId);
      return {
        outcome: "incomplete",
        state: "uploaded_to_platform_draft",
        externalPostId: null,
        detail:
          "The video is in the TikTok app's drafts. It is not posted — open TikTok, review it and publish it there.",
      };
    }

    if (mapped === "published") {
      if (postId === null) {
        // TikTok says it is done but named no post. Recording a publication
        // here would mean inventing the id that proves it, so this reports the
        // ambiguity instead — and warns against a retry, which could post again.
        await updateSessionStatus(client, sessionId, "processing");
        return {
          outcome: "incomplete",
          state: "uploaded_to_platform_draft",
          externalPostId: null,
          detail:
            "TikTok reports this publish as complete but returned no post id. The post likely exists — check the account before retrying, because retrying could post a second copy.",
        };
      }

      await recordPublished(client, sessionId, postId);
      return {
        outcome: "succeeded",
        externalPostId: postId,
        externalPostUrl: postUrl(account.handle, postId),
      };
    }

    // Still in flight. Not a failure: the next run finds this same session by
    // its idempotency key and asks again rather than uploading a second copy.
    await updateSessionStatus(client, sessionId, "processing");
    return {
      outcome: "incomplete",
      state: "uploaded_to_platform_draft",
      externalPostId: null,
      detail:
        "TikTok has the video and is still processing it. Nothing has been confirmed as posted, and the next run will ask about this same upload rather than sending another.",
    };
  }

  /** Whether the granted scopes cover this delivery mode. */
  private scopeProblemFor(
    mode: DeliveryMode,
    grantedScopes: string[],
  ): ReadinessProblem | null {
    if (mode === "direct_post" && !canDirectPost(grantedScopes)) {
      return {
        code: "provider_permission_revoked",
        message:
          "The TikTok connection was granted without the publish permission, so it cannot post directly. Reconnect and accept it, or switch this variant to a draft upload.",
      };
    }
    if (mode === "inbox" && !canUploadToDrafts(grantedScopes)) {
      return {
        code: "provider_permission_revoked",
        message:
          "The TikTok connection was granted without the upload permission, so nothing can be sent to your drafts.",
      };
    }
    return null;
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
   * TikTok's refresh is Google's grant exchange in shape, so the shared
   * credential path handles it — with TikTok's own config, because the request
   * needs `client_key` rather than `client_id`.
   */
  private async liveToken(
    client: SupabaseClient,
    account: SocialAccount,
  ): Promise<string | null> {
    const result = await getLiveCredential(client, account);
    return result.ok ? result.credential.accessToken : null;
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

export const tiktokProvider = new TikTokProvider();
