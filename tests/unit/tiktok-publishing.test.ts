// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import {
  fetchCreatorInfo,
  fetchPublishStatus,
  fetchUser,
  initDirectPost,
  initInboxUpload,
  uploadChunk,
} from "@/lib/tiktok/api";
import {
  chunkRange,
  MAX_CHUNK_COUNT,
  MAX_FINAL_CHUNK_BYTES,
  MEDIA_SOURCE,
  MIN_CHUNK_BYTES,
  planChunks,
  PULL_FROM_URL_SUPPORTED,
  TIKTOK_AUTH_ENDPOINT,
  TIKTOK_SCOPES,
} from "@/lib/tiktok/config";
import {
  categoryForStatus,
  categoryForTikTokCode,
  classifyTikTokError,
  isOk,
  tiktokErrorCode,
} from "@/lib/tiktok/errors";
import {
  buildCaption,
  privacyLevelAllowed,
  scriptureBlock,
  tiktokSettingsDigest,
  validateAgainstCreator,
  validateForTikTok,
} from "@/lib/tiktok/metadata";
import {
  buildTikTokAuthorizationUrl,
  canDirectPost,
  canUploadToDrafts,
  missingScopes,
  parseTikTokTokenResponse,
  TikTokOAuthError,
} from "@/lib/tiktok/oauth";
import { parseTikTokMetadataForm } from "@/lib/tiktok/schema";
import {
  mapPublishStatus,
  postUrl,
  type CreatorInfo,
  type TikTokVideoMetadata,
} from "@/lib/tiktok/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * TikTok publishing.
 *
 * Three invariants carry most of the weight:
 *
 * 1. **A draft is not a post.** Only a direct post that TikTok confirmed with
 *    its own post id may be recorded as a publication.
 * 2. **An unknown status is never success.** TikTok can return a status this
 *    client has never seen, and the safe reading is "not yet".
 * 3. **The audience comes from TikTok.** This application never offers a
 *    privacy level TikTok did not return for that specific creator.
 */

const NOW = new Date("2026-08-12T12:00:00Z");

const VARIANT: PlatformVariant = {
  id: "variant-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  platform: "tiktok",
  variant_type: "tiktok_video",
  title: null,
  caption: "A word for today.",
  description: null,
  hashtags: ["promises", "faith"],
  first_comment: null,
  cta: "Follow for daily promises.",
  thumbnail_text: null,
  review_state: "approved",
  approved_at: "2026-08-10T00:00:00Z",
  approved_by: "owner-1",
  approval_hash: "a".repeat(64),
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
};

const ITEM: ContentItem = {
  id: "item-1",
  owner_id: "owner-1",
  title: "A promise for today",
  content_type: "tiktok_video",
  topic: null,
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises",
  scripture_translation: "KJV",
  scripture_verification_status: "manually_verified",
  scripture_verified_at: "2026-08-10T00:00:00Z",
  scripture_verified_by: "owner-1",
  description: null,
  status: "draft",
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
};

function metadata(
  overrides: Partial<TikTokVideoMetadata> = {},
): TikTokVideoMetadata {
  return {
    id: "meta-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    privacy_level: "SELF_ONLY",
    disable_comment: false,
    disable_duet: false,
    disable_stitch: false,
    is_commercial_content: false,
    is_branded_content: false,
    is_your_brand: false,
    delivery_mode: "direct_post",
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function creator(overrides: Partial<CreatorInfo> = {}): CreatorInfo {
  return {
    username: "preciouspromises",
    nickname: "Precious Promises",
    avatarUrl: null,
    privacyLevelOptions: ["SELF_ONLY"],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoPostDurationSec: 600,
    ...overrides,
  };
}

/** A fetch that answers once with a given status and body. */
function respondWith(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

function ok(data: unknown): unknown {
  return { data, error: { code: "ok", message: "", log_id: "log-1" } };
}

// ---------------------------------------------------------------------------
// A draft is not a post
// ---------------------------------------------------------------------------

describe("a draft is not a post", () => {
  it("maps a completed direct post to published", () => {
    expect(mapPublishStatus("PUBLISH_COMPLETE", "direct_post")).toBe(
      "published",
    );
  });

  it("maps the identical completed inbox upload to a draft, not a post", () => {
    // The same TikTok status means two different things. Collapsing them is the
    // single easiest way for this system to claim a post nobody made.
    expect(mapPublishStatus("PUBLISH_COMPLETE", "inbox")).toBe(
      "uploaded_to_draft",
    );
  });

  it("never maps an unrecognised status to success", () => {
    for (const mode of ["direct_post", "inbox"] as const) {
      for (const status of [
        null,
        "",
        "SOMETHING_NEW",
        "publish_complete",
        "OK",
        "SUCCESS",
      ]) {
        expect(mapPublishStatus(status, mode), `${status}/${mode}`).toBe(
          "processing",
        );
      }
    }
  });

  it("treats every in-flight status as processing", () => {
    for (const status of [
      "PROCESSING_UPLOAD",
      "PROCESSING_DOWNLOAD",
      "SEND_TO_USER_INBOX",
    ]) {
      expect(mapPublishStatus(status, "direct_post"), status).toBe(
        "processing",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Post URLs are never invented
// ---------------------------------------------------------------------------

describe("post URLs", () => {
  it("builds a URL only from a real username and post id", () => {
    expect(postUrl("preciouspromises", "7300000000000000000")).toBe(
      "https://www.tiktok.com/@preciouspromises/video/7300000000000000000",
    );
  });

  it("strips a stored leading @ rather than encoding it into the path", () => {
    // Account rows store the handle as "@name"; TikTok's URL supplies its own.
    expect(postUrl("@preciouspromises", "7300000000000000000")).toBe(
      "https://www.tiktok.com/@preciouspromises/video/7300000000000000000",
    );
  });

  it("returns null rather than guessing a link that leads nowhere", () => {
    expect(postUrl(null, "7300000000000000000")).toBeNull();
    expect(postUrl("preciouspromises", null)).toBeNull();
    expect(postUrl("", "")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Media delivery
// ---------------------------------------------------------------------------

describe("how media reaches TikTok", () => {
  it("uploads bytes rather than asking TikTok to fetch a URL", () => {
    expect(MEDIA_SOURCE).toBe("FILE_UPLOAD");
    expect(PULL_FROM_URL_SUPPORTED).toBe(false);
  });

  it("sends a small video whole rather than as an undersized chunk", () => {
    const plan = planChunks(1_000_000);
    expect(plan).toEqual({ chunkSize: 1_000_000, totalChunks: 1 });
  });

  it("rounds the chunk count down, so the last chunk carries the remainder", () => {
    // TikTok documents total_chunk_count as the video size divided by the chunk
    // size rounded DOWN. Rounding up would produce a final chunk below the 5 MB
    // floor, which TikTok rejects.
    const size = 10 * 1024 * 1024 + 1_234_567;
    const plan = planChunks(size);

    expect(plan).not.toBeNull();
    expect(plan!.totalChunks).toBe(Math.floor(size / plan!.chunkSize));
  });

  it("covers every byte exactly once", () => {
    const size = 47 * 1024 * 1024 + 99;
    const plan = planChunks(size)!;

    let covered = 0;
    let previousEnd = -1;

    for (let i = 0; i < plan.totalChunks; i += 1) {
      const { start, end } = chunkRange(
        i,
        plan.chunkSize,
        plan.totalChunks,
        size,
      );
      expect(start, `chunk ${i}`).toBe(previousEnd + 1);
      covered += end - start + 1;
      previousEnd = end;
    }

    expect(covered).toBe(size);
    expect(previousEnd).toBe(size - 1);
  });

  it("keeps every chunk inside the documented limits", () => {
    const size = 500 * 1024 * 1024;
    const plan = planChunks(size)!;

    expect(plan.totalChunks).toBeLessThanOrEqual(MAX_CHUNK_COUNT);

    const final = chunkRange(
      plan.totalChunks - 1,
      plan.chunkSize,
      plan.totalChunks,
      size,
    );
    const finalBytes = final.end - final.start + 1;

    expect(finalBytes).toBeGreaterThanOrEqual(MIN_CHUNK_BYTES);
    expect(finalBytes).toBeLessThanOrEqual(MAX_FINAL_CHUNK_BYTES);
  });

  it("refuses a plan it cannot make honestly rather than one that fails midway", () => {
    expect(planChunks(0)).toBeNull();
    expect(planChunks(-1)).toBeNull();
    expect(planChunks(Number.NaN)).toBeNull();
  });

  it("sends an inclusive Content-Range naming the whole size", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    await uploadChunk(
      {
        uploadUrl: "https://upload.tiktok.example/abc",
        body: "bytes",
        contentType: "video/mp4",
        start: 0,
        end: 9,
        totalBytes: 100,
      },
      fetchImpl as unknown as typeof fetch,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = init.headers as Record<string, string>;

    expect(init.method).toBe("PUT");
    expect(headers["Content-Range"]).toBe("bytes 0-9/100");
    expect(headers["Content-Length"]).toBe("10");
  });

  it("never sends the account token to the upload host", async () => {
    // The upload URL is already an authenticated capability. Attaching the
    // bearer token would put the account credential on a host that does not
    // need it.
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    await uploadChunk(
      {
        uploadUrl: "https://upload.tiktok.example/abc",
        body: "bytes",
        contentType: "video/mp4",
        start: 0,
        end: 9,
        totalBytes: 10,
      },
      fetchImpl as unknown as typeof fetch,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });
});

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

describe("TikTok OAuth", () => {
  const config = {
    clientKey: "key-1",
    clientSecret: "secret-1",
    redirectUri: "https://app.example/api/oauth/tiktok/callback",
  };

  it("uses client_key, which is what TikTok expects", () => {
    const url = new URL(buildTikTokAuthorizationUrl(config, "state-1"));

    expect(url.origin + url.pathname).toBe(TIKTOK_AUTH_ENDPOINT);
    expect(url.searchParams.get("client_key")).toBe("key-1");
    expect(url.searchParams.get("client_id")).toBeNull();
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("never puts the client secret in the authorisation URL", () => {
    expect(buildTikTokAuthorizationUrl(config, "state-1")).not.toContain(
      "secret-1",
    );
  });

  it("asks for nothing about comments, messages or analytics", () => {
    expect([...TIKTOK_SCOPES]).toEqual([
      "user.info.basic",
      "video.upload",
      "video.publish",
    ]);
  });

  it("separates the permission to draft from the permission to post", () => {
    expect(canUploadToDrafts(["video.upload"])).toBe(true);
    expect(canDirectPost(["video.upload"])).toBe(false);
    expect(canDirectPost(["video.upload", "video.publish"])).toBe(true);
  });

  it("names the scopes that were asked for and not granted", () => {
    expect(missingScopes(["user.info.basic", "video.upload"])).toEqual([
      "video.publish",
    ]);
  });

  it("reads an error reported alongside HTTP 200", () => {
    // TikTok answers failures with a 200 and an error field. A client trusting
    // the status would treat a rejection as a token.
    expect(() =>
      parseTikTokTokenResponse(
        { error: "invalid_grant", error_description: "code=abc123" },
        NOW,
      ),
    ).toThrow(TikTokOAuthError);
  });

  it("never carries TikTok's error description into the message", () => {
    // error_description can quote the request, including the code.
    try {
      parseTikTokTokenResponse({
        error: "invalid_grant",
        error_description: "the code abc123 has expired",
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("abc123");
    }
  });

  it("keeps TikTok's rotated refresh token", () => {
    const tokens = parseTikTokTokenResponse(
      {
        access_token: "at-1",
        refresh_token: "rt-2",
        expires_in: 86_400,
        scope: "user.info.basic,video.upload,video.publish",
        open_id: "open-1",
      },
      NOW,
    );

    expect(tokens.refreshToken).toBe("rt-2");
    expect(tokens.openId).toBe("open-1");
    expect(tokens.grantedScopes).toEqual([
      "user.info.basic",
      "video.upload",
      "video.publish",
    ]);
    expect(tokens.expiresAt.getTime()).toBe(NOW.getTime() + 86_400_000);
  });

  it("refuses a response with no access token", () => {
    expect(() => parseTikTokTokenResponse({ scope: "video.upload" })).toThrow(
      TikTokOAuthError,
    );
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("classifying TikTok failures", () => {
  it("treats `ok` as success rather than as an error code", () => {
    expect(tiktokErrorCode({ error: { code: "ok" } })).toBeNull();
    expect(isOk({ error: { code: "ok" } })).toBe(true);
    expect(isOk({ error: { code: "invalid_param" } })).toBe(false);
  });

  it("treats a body with no error field as not-ok", () => {
    // Absence is not confirmation. TikTok states success explicitly.
    expect(isOk({ data: {} })).toBe(false);
    expect(isOk(null)).toBe(false);
  });

  it("maps a revoked authorisation to a reconnection, not a retry", () => {
    expect(categoryForTikTokCode("access_token_invalid")).toBe(
      "provider_permission_revoked",
    );
    expect(categoryForTikTokCode("scope_not_authorized")).toBe(
      "provider_permission_revoked",
    );
  });

  it("maps the audit restriction to a content problem the owner can act on", () => {
    expect(
      categoryForTikTokCode(
        "unaudited_client_can_only_post_to_private_accounts",
      ),
    ).toBe("invalid_content");
  });

  it("falls back to the status for an unrecognised code", () => {
    expect(categoryForTikTokCode("something_new")).toBeNull();
    expect(
      classifyTikTokError(429, { error: { code: "something_new" } }).code,
    ).toBe("provider_rate_limited");
  });

  it("leaves an unrecognised status as unknown, which is not retryable", () => {
    const safe = classifyTikTokError(299, {});
    expect(safe.code).toBe("unknown");
    expect(safe.retryable).toBe(false);
    expect(categoryForStatus(299)).toBe("unknown");
  });

  it("drops log_id, which the owner cannot act on", () => {
    const safe = classifyTikTokError(400, {
      error: { code: "invalid_param", message: "bad title", log_id: "LOG-XYZ" },
    });

    expect(safe.message).not.toContain("LOG-XYZ");
    expect(safe.message).toContain("invalid_param");
  });
});

// ---------------------------------------------------------------------------
// The API client
// ---------------------------------------------------------------------------

describe("the Content Posting API client", () => {
  it("raises on an error body even when the HTTP status is 200", async () => {
    const fetchImpl = respondWith(200, {
      data: {},
      error: { code: "spam_risk_too_many_posts", message: "slow down" },
    });

    await expect(
      fetchCreatorInfo({ accessToken: "at-1", fetchImpl }),
    ).rejects.toThrow(/spam_risk_too_many_posts/);
  });

  it("drops privacy options it does not recognise rather than passing them on", async () => {
    const fetchImpl = respondWith(
      200,
      ok({
        creator_username: "preciouspromises",
        privacy_level_options: ["SELF_ONLY", "SOMETHING_NEW", 42],
      }),
    );

    const info = await fetchCreatorInfo({ accessToken: "at-1", fetchImpl });
    expect(info.privacyLevelOptions).toEqual(["SELF_ONLY"]);
  });

  it("identifies the account before a connection could be recorded", async () => {
    const fetchImpl = respondWith(
      200,
      ok({ user: { open_id: "open-1", display_name: "Precious Promises" } }),
    );

    const user = await fetchUser({ accessToken: "at-1", fetchImpl });
    expect(user).toEqual({
      openId: "open-1",
      displayName: "Precious Promises",
      avatarUrl: null,
    });
  });

  it("returns null rather than an account with no id", async () => {
    const fetchImpl = respondWith(
      200,
      ok({ user: { display_name: "Someone" } }),
    );
    expect(await fetchUser({ accessToken: "at-1", fetchImpl })).toBeNull();
  });

  it("sends post_info for a direct post and none for an inbox upload", async () => {
    const direct = vi.fn(
      async () =>
        new Response(
          JSON.stringify(ok({ publish_id: "p-1", upload_url: "https://u/1" })),
          { status: 200 },
        ),
    );
    const inbox = vi.fn(
      async () =>
        new Response(
          JSON.stringify(ok({ publish_id: "p-2", upload_url: "https://u/2" })),
          { status: 200 },
        ),
    );

    const source = {
      videoSizeBytes: 100,
      chunkSizeBytes: 100,
      totalChunkCount: 1,
    };

    await initDirectPost(
      { accessToken: "at-1", fetchImpl: direct as unknown as typeof fetch },
      {
        title: "A word",
        privacyLevel: "SELF_ONLY",
        disableComment: false,
        disableDuet: true,
        disableStitch: false,
        brandContentToggle: false,
        brandOrganicToggle: false,
      },
      source,
    );

    await initInboxUpload(
      { accessToken: "at-1", fetchImpl: inbox as unknown as typeof fetch },
      source,
    );

    const directBody = JSON.parse(
      (direct.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    const inboxBody = JSON.parse(
      (inbox.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );

    expect(directBody.post_info.privacy_level).toBe("SELF_ONLY");
    expect(directBody.source_info.source).toBe("FILE_UPLOAD");
    // No post_info at all: an inbox upload is not a post, so it has no
    // audience, no interaction settings and needs no audit.
    expect(inboxBody.post_info).toBeUndefined();
    expect(inboxBody.source_info.source).toBe("FILE_UPLOAD");
  });

  it("refuses an init that returned no publish id", async () => {
    const fetchImpl = respondWith(200, ok({ upload_url: "https://u/1" }));

    await expect(
      initInboxUpload(
        { accessToken: "at-1", fetchImpl },
        { videoSizeBytes: 1, chunkSizeBytes: 1, totalChunkCount: 1 },
      ),
    ).rejects.toThrow(/publish id/i);
  });

  it("reads a post id back only from TikTok's own field", async () => {
    const fetchImpl = respondWith(
      200,
      ok({
        status: "PUBLISH_COMPLETE",
        publicaly_available_post_id: ["7300000000000000000"],
      }),
    );

    const status = await fetchPublishStatus(
      { accessToken: "at-1", fetchImpl },
      "p-1",
    );

    expect(status.status).toBe("PUBLISH_COMPLETE");
    expect(status.postIds).toEqual(["7300000000000000000"]);
  });

  it("reports no post ids when TikTok named none", async () => {
    const fetchImpl = respondWith(200, ok({ status: "PROCESSING_UPLOAD" }));

    const status = await fetchPublishStatus(
      { accessToken: "at-1", fetchImpl },
      "p-1",
    );

    expect(status.postIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Caption and Scripture
// ---------------------------------------------------------------------------

describe("building a TikTok caption", () => {
  it("keeps Scripture separate from the commentary around it", () => {
    const caption = buildCaption(VARIANT, ITEM);
    const block = scriptureBlock(ITEM)!;

    expect(caption).toContain(block);
    expect(caption.split("\n\n").length).toBeGreaterThan(2);
    expect(caption).toContain("2 Peter 1:4 KJV");
  });

  it("quotes a reference alone when no verse text is stored", () => {
    // Filling in the verse from memory is exactly what this project forbids.
    expect(
      scriptureBlock({
        scripture_reference: "John 3:16",
        scripture_text: null,
        scripture_translation: "KJV",
      }),
    ).toBe("John 3:16 (KJV)");
  });

  it("returns nothing rather than inventing Scripture", () => {
    expect(
      scriptureBlock({
        scripture_reference: null,
        scripture_text: null,
        scripture_translation: "",
      }),
    ).toBeNull();
  });

  it("refuses a variant with nothing to post", () => {
    const problems = validateForTikTok({
      variant: {
        ...VARIANT,
        caption: null,
        description: null,
        cta: null,
        hashtags: [],
      },
      item: {
        ...ITEM,
        scripture_reference: null,
        scripture_text: null,
        scripture_translation: "",
      },
      metadata: metadata(),
    });

    expect(problems.map((p) => p.message).join(" ")).toMatch(
      /nothing to post/i,
    );
  });
});

// ---------------------------------------------------------------------------
// The audience comes from TikTok
// ---------------------------------------------------------------------------

describe("the audience is never chosen by this application", () => {
  it("accepts only a level TikTok returned for this creator", () => {
    expect(privacyLevelAllowed("SELF_ONLY", creator())).toBe(true);
    expect(privacyLevelAllowed("PUBLIC_TO_EVERYONE", creator())).toBe(false);
    expect(privacyLevelAllowed(null, creator())).toBe(false);
  });

  it("refuses a direct post whose audience TikTok no longer offers", () => {
    const problems = validateAgainstCreator(
      metadata({ privacy_level: "PUBLIC_TO_EVERYONE" }),
      creator({ privacyLevelOptions: ["SELF_ONLY"] }),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/does not currently offer/i);
  });

  it("refuses a direct post with no audience chosen", () => {
    const problems = validateAgainstCreator(
      metadata({ privacy_level: null }),
      creator(),
    );

    expect(problems[0].message).toMatch(/will not choose it for you/i);
  });

  it("leaves an inbox upload alone: it has no audience to check", () => {
    expect(
      validateAgainstCreator(
        metadata({ delivery_mode: "inbox", privacy_level: null }),
        creator(),
      ),
    ).toEqual([]);
  });

  it("refuses to enable an interaction the creator switched off", () => {
    const problems = validateAgainstCreator(
      metadata({ disable_comment: false }),
      creator({ commentDisabled: true }),
    );

    expect(problems.map((p) => p.message).join(" ")).toMatch(/comments/i);
  });

  it("refuses branded content posted privately", () => {
    const problems = validateAgainstCreator(
      metadata({ is_commercial_content: true, is_branded_content: true }),
      creator({ privacyLevelOptions: ["SELF_ONLY"] }),
    );

    expect(problems.map((p) => p.message).join(" ")).toMatch(
      /cannot be posted privately/i,
    );
  });
});

// ---------------------------------------------------------------------------
// The settings form
// ---------------------------------------------------------------------------

describe("the TikTok settings form", () => {
  const base = {
    delivery_mode: "inbox",
    privacy_level: null,
    disable_comment: null,
    disable_duet: null,
    disable_stitch: null,
    is_commercial_content: null,
    is_branded_content: null,
    is_your_brand: null,
  };

  it("accepts an unticked checkbox, which FormData reports as null", () => {
    const result = parseTikTokMetadataForm(base);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.disable_comment).toBe(false);
      expect(result.data.privacy_level).toBeNull();
    }
  });

  it("defaults a new variant to a draft upload with no audience", () => {
    // The safest default is the one that cannot post anything.
    const result = parseTikTokMetadataForm(base);
    expect(result.success && result.data.delivery_mode).toBe("inbox");
  });

  it("refuses a direct post with no audience", () => {
    const result = parseTikTokMetadataForm({
      ...base,
      delivery_mode: "direct_post",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.privacy_level).toMatch(/needs an audience/i);
    }
  });

  it("refuses a brand declaration without the commercial disclosure", () => {
    const result = parseTikTokMetadataForm({
      ...base,
      is_branded_content: "on",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.is_commercial_content).toBeTruthy();
    }
  });

  it("refuses branded content set to private", () => {
    const result = parseTikTokMetadataForm({
      ...base,
      delivery_mode: "direct_post",
      privacy_level: "SELF_ONLY",
      is_commercial_content: "on",
      is_branded_content: "on",
    });

    expect(result.success).toBe(false);
  });

  it("refuses a privacy level TikTok does not define", () => {
    const result = parseTikTokMetadataForm({
      ...base,
      delivery_mode: "direct_post",
      privacy_level: "EVERYONE",
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The approval fingerprint
// ---------------------------------------------------------------------------

describe("TikTok settings in the approval fingerprint", () => {
  it("has no digest until settings are saved", () => {
    // Saving for the first time is itself a change.
    expect(tiktokSettingsDigest(null)).toBeNull();
  });

  it("changes when the delivery mode changes", () => {
    // The largest change that can be made to an approved item: the difference
    // between something Dave publishes and something this system publishes.
    expect(tiktokSettingsDigest(metadata({ delivery_mode: "inbox" }))).not.toBe(
      tiktokSettingsDigest(metadata({ delivery_mode: "direct_post" })),
    );
  });

  it("changes when the audience changes", () => {
    expect(
      tiktokSettingsDigest(metadata({ privacy_level: "PUBLIC_TO_EVERYONE" })),
    ).not.toBe(tiktokSettingsDigest(metadata({ privacy_level: "SELF_ONLY" })));
  });

  it("changes when a commercial declaration changes", () => {
    expect(
      tiktokSettingsDigest(metadata({ is_commercial_content: true })),
    ).not.toBe(
      tiktokSettingsDigest(metadata({ is_commercial_content: false })),
    );
  });

  it("ignores timestamps, which change without changing the post", () => {
    expect(
      tiktokSettingsDigest(metadata({ updated_at: "2027-01-01T00:00:00Z" })),
    ).toBe(tiktokSettingsDigest(metadata()));
  });
});
