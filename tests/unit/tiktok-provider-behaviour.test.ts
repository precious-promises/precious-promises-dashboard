// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import type { PublishRequest } from "@/lib/publishing/providers";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The TikTok provider, exercised rather than read.
 *
 * The three outcomes are the point. TikTok is the first platform where "it
 * worked" has more than one meaning, and every test here checks that the
 * provider keeps them apart:
 *
 * - `manual` sends nothing and reports `ready_for_manual_post`.
 * - `inbox` uploads and reports `uploaded_to_platform_draft` — **never**
 *   `succeeded`, because a draft is not a post.
 * - `direct_post` reports `succeeded` only when TikTok returned a post id.
 *
 * The database is faked, and so is TikTok. What is not faked is the provider's
 * own decision-making, which is the thing under test.
 */

/** A minimal Supabase query stub. Every filter returns itself. */
function makeClient(tables: Record<string, unknown>) {
  const builder = (table: string) => {
    const rows = tables[table];

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      is: () => chain,
      lt: () => chain,
      limit: () => chain,
      order: () => Promise.resolve({ data: rows ?? [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null),
          error: null,
        }),
      single: () =>
        Promise.resolve({
          data: Array.isArray(rows) ? (rows[0] ?? null) : (rows ?? null),
          error: null,
        }),
      insert: () => chain,
      update: () => chain,
      upsert: () => chain,
      delete: () => chain,
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows ?? [], error: null }),
    };

    return chain;
  };

  return { from: (table: string) => builder(table) };
}

process.env.APP_URL ||= "http://localhost:3000";

let clientTables: Record<string, unknown> = {};
let configured = true;

vi.mock("@/lib/supabase/worker", () => ({
  createWorkerClient: () => ({
    client: configured ? makeClient(clientTables) : null,
    reason: configured ? null : "not configured",
  }),
  isWorkerConfigured: () => configured,
}));

vi.mock("@/lib/tiktok/server-config", () => ({
  resolveTikTokConfig: () => ({
    config: configured
      ? {
          clientKey: "test-key",
          clientSecret: "test-secret",
          redirectUri: "https://example.test/api/oauth/tiktok/callback",
        }
      : null,
    problems: configured ? [] : ["TIKTOK_CLIENT_KEY is not set."],
  }),
  isTikTokConfigured: () => configured,
}));

/** The stored credential, which the provider opens through the shared path. */
let credentialOk = true;

vi.mock("@/lib/accounts/credentials", () => ({
  getLiveCredential: async () =>
    credentialOk
      ? {
          ok: true,
          credential: {
            accessToken: "at-1",
            grantedScopes: ["video.upload", "video.publish"],
          },
        }
      : { ok: false, reason: "expired", needsReconnect: true },
  markNeedsReconnect: async () => undefined,
}));

/** The media, resolved through Stage 8's storage provider. */
let mediaAvailable = true;
const openRange = vi.fn(async () => "chunk-bytes" as unknown as BodyInit);
const openWhole = vi.fn(async () => "whole-bytes" as unknown as BodyInit);

vi.mock("@/lib/youtube/media-source", () => ({
  resolveMediaSource: async () =>
    mediaAvailable
      ? {
          available: true,
          source: {
            contentType: "video/mp4",
            contentLength: 1_000_000,
            filename: "promise.mp4",
            open: openWhole,
            openRange,
          },
        }
      : {
          available: false,
          error: {
            code: "media_source_unavailable",
            message: "No media.",
            retryable: false,
          },
        },
  MEDIA_RETRIEVAL_AVAILABLE: true,
  MEDIA_RETRIEVAL_DETAIL: "Drive.",
}));

/** TikTok itself. Each test sets exactly what it needs. */
const api = {
  creatorInfo: {
    username: "preciouspromises",
    nickname: null,
    avatarUrl: null,
    privacyLevelOptions: ["SELF_ONLY"] as string[],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
    maxVideoPostDurationSec: 600,
  },
  status: {
    status: "PUBLISH_COMPLETE",
    postIds: ["7300000000000000000"],
    failReason: null,
    uploadedBytes: 1_000_000,
  } as {
    status: string;
    postIds: string[];
    failReason: string | null;
    uploadedBytes: number | null;
  },
};

const fetchCreatorInfo = vi.fn(async () => api.creatorInfo);
const initDirectPost = vi.fn(async () => ({
  publishId: "p-direct",
  uploadUrl: "https://upload.tiktok.example/direct",
}));
const initInboxUpload = vi.fn(async () => ({
  publishId: "p-inbox",
  uploadUrl: "https://upload.tiktok.example/inbox",
}));
const uploadChunk = vi.fn(async () => undefined);
const fetchPublishStatus = vi.fn(async () => api.status);

vi.mock("@/lib/tiktok/api", () => ({
  fetchCreatorInfo: (...args: unknown[]) => fetchCreatorInfo(...(args as [])),
  initDirectPost: (...args: unknown[]) => initDirectPost(...(args as [])),
  initInboxUpload: (...args: unknown[]) => initInboxUpload(...(args as [])),
  uploadChunk: (...args: unknown[]) => uploadChunk(...(args as [])),
  fetchPublishStatus: (...args: unknown[]) =>
    fetchPublishStatus(...(args as [])),
  fetchUser: async () => ({
    openId: "open-1",
    displayName: null,
    avatarUrl: null,
  }),
}));

/** The session row the provider writes before any byte is sent. */
let recordedSessionId: string | null = "session-1";
const recordSession = vi.fn(async () => recordedSessionId);
const recordPublished = vi.fn(async () => undefined);
const recordUploadedToDraft = vi.fn(async () => undefined);
const updateSessionStatus = vi.fn(async () => undefined);
const recordChunksSent = vi.fn(async () => undefined);
let existingSession: unknown = null;
let storedMetadata: unknown = null;
let storedUploadUrl: string | null = "https://upload.tiktok.example/resume";

vi.mock("@/lib/tiktok/repository", () => ({
  findSession: async () => existingSession,
  loadTikTokMetadataAsWorker: async () => storedMetadata,
  openUploadUrl: async () => storedUploadUrl,
  recordSession: (...args: unknown[]) => recordSession(...(args as [])),
  recordPublished: (...args: unknown[]) => recordPublished(...(args as [])),
  recordUploadedToDraft: (...args: unknown[]) =>
    recordUploadedToDraft(...(args as [])),
  updateSessionStatus: (...args: unknown[]) =>
    updateSessionStatus(...(args as [])),
  recordChunksSent: (...args: unknown[]) => recordChunksSent(...(args as [])),
  loadTikTokMetadata: async () => storedMetadata,
  loadTikTokMetadataFor: async () => new Map(),
  sessionsForPost: async () => [],
  deliveryModeFor: async () => null,
}));

const { tiktokProvider } = await import("@/lib/tiktok/provider");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VARIANT: PlatformVariant = {
  id: "variant-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  platform: "tiktok",
  variant_type: "tiktok_video",
  title: null,
  caption: "A word for today.",
  description: null,
  hashtags: [],
  first_comment: null,
  cta: null,
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

const REQUEST: PublishRequest = {
  scheduledPost: { id: "post-1", owner_id: "owner-1" } as ScheduledPost,
  variant: VARIANT,
  item: ITEM,
  idempotencyKey: "pp_publish_tiktok_abc123def456",
};

const CONNECTED_ACCOUNT = {
  id: "account-1",
  owner_id: "owner-1",
  platform: "tiktok",
  provider_account_id: "open-1",
  channel_id: null,
  channel_title: null,
  status: "connected",
  granted_scopes: ["user.info.basic", "video.upload", "video.publish"],
  connected_at: "2026-08-10T00:00:00Z",
  disconnected_at: null,
  token_expires_at: null,
  display_name: "Precious Promises",
  handle: "@preciouspromises",
  created_at: "2026-08-10T00:00:00Z",
  updated_at: "2026-08-10T00:00:00Z",
};

function settings(overrides: Record<string, unknown> = {}) {
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

beforeEach(() => {
  configured = true;
  credentialOk = true;
  mediaAvailable = true;
  recordedSessionId = "session-1";
  existingSession = null;
  storedUploadUrl = "https://upload.tiktok.example/resume";
  storedMetadata = settings();
  clientTables = {
    social_accounts: [CONNECTED_ACCOUNT],
    content_media: [
      { media_asset_id: "asset-1", purpose: "primary", sort_order: 0 },
    ],
    media_assets: [
      {
        id: "asset-1",
        owner_id: "owner-1",
        media_type: "video",
        storage_provider: "google_drive",
        external_file_id: "drive-1",
      },
    ],
  };
  api.creatorInfo.privacyLevelOptions = ["SELF_ONLY"];
  api.status = {
    status: "PUBLISH_COMPLETE",
    postIds: ["7300000000000000000"],
    failReason: null,
    uploadedBytes: 1_000_000,
  };
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Manual: nothing is sent
// ---------------------------------------------------------------------------

describe("manual posting", () => {
  it("reports a real state without touching TikTok", async () => {
    storedMetadata = settings({ delivery_mode: "manual", privacy_level: null });

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("incomplete");
    if (result.outcome === "incomplete") {
      expect(result.state).toBe("ready_for_manual_post");
      expect(result.externalPostId).toBeNull();
      expect(result.detail).toMatch(/nothing has been sent/i);
    }
  });

  it("makes no request of any kind", async () => {
    storedMetadata = settings({ delivery_mode: "manual", privacy_level: null });

    await tiktokProvider.publish(REQUEST);

    expect(initDirectPost).not.toHaveBeenCalled();
    expect(initInboxUpload).not.toHaveBeenCalled();
    expect(uploadChunk).not.toHaveBeenCalled();
    expect(recordSession).not.toHaveBeenCalled();
  });

  it("needs no connected account", async () => {
    storedMetadata = settings({ delivery_mode: "manual", privacy_level: null });
    clientTables.social_accounts = [];

    const problems = await tiktokProvider.validateReadiness(REQUEST);

    expect(problems.map((p) => p.code)).not.toContain("provider_not_connected");
  });
});

// ---------------------------------------------------------------------------
// Inbox: a draft is not a post
// ---------------------------------------------------------------------------

describe("uploading to TikTok drafts", () => {
  beforeEach(() => {
    storedMetadata = settings({
      delivery_mode: "inbox",
      privacy_level: null,
    });
    api.status = {
      status: "PUBLISH_COMPLETE",
      postIds: [],
      failReason: null,
      uploadedBytes: 1_000_000,
    };
  });

  it("never reports success, even when TikTok says the publish completed", async () => {
    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("incomplete");
    if (result.outcome === "incomplete") {
      expect(result.state).toBe("uploaded_to_platform_draft");
      expect(result.externalPostId).toBeNull();
      expect(result.detail).toMatch(/not posted/i);
    }
    expect(recordPublished).not.toHaveBeenCalled();
    expect(recordUploadedToDraft).toHaveBeenCalled();
  });

  it("never asks TikTok what this creator may post — a draft has no audience", async () => {
    await tiktokProvider.publish(REQUEST);
    expect(fetchCreatorInfo).not.toHaveBeenCalled();
  });

  it("uses the inbox endpoint, not the direct-post one", async () => {
    await tiktokProvider.publish(REQUEST);

    expect(initInboxUpload).toHaveBeenCalledTimes(1);
    expect(initDirectPost).not.toHaveBeenCalled();
  });

  it("ignores a post id TikTok should not have sent for an inbox upload", async () => {
    api.status = {
      status: "PUBLISH_COMPLETE",
      postIds: ["7300000000000000000"],
      failReason: null,
      uploadedBytes: 1_000_000,
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("incomplete");
    expect(recordPublished).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Direct post: success needs a post id
// ---------------------------------------------------------------------------

describe("posting directly", () => {
  it("reports success only with TikTok's own post id", async () => {
    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("succeeded");
    if (result.outcome === "succeeded") {
      expect(result.externalPostId).toBe("7300000000000000000");
      // The account row stores the handle with an "@" and TikTok's URL format
      // supplies its own; the stored one must not be encoded into the path.
      expect(result.externalPostUrl).toBe(
        "https://www.tiktok.com/@preciouspromises/video/7300000000000000000",
      );
    }
    expect(recordPublished).toHaveBeenCalled();
  });

  it("refuses to claim a post when TikTok named none", async () => {
    api.status = {
      status: "PUBLISH_COMPLETE",
      postIds: [],
      failReason: null,
      uploadedBytes: 1_000_000,
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("incomplete");
    if (result.outcome === "incomplete") {
      expect(result.detail).toMatch(/no post id/i);
      expect(result.detail).toMatch(/second copy/i);
    }
    expect(recordPublished).not.toHaveBeenCalled();
  });

  it("reports an unrecognised status as still in flight, never as posted", async () => {
    api.status = {
      status: "SOMETHING_TIKTOK_ADDED_LATER",
      postIds: [],
      failReason: null,
      uploadedBytes: 0,
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("incomplete");
    expect(recordPublished).not.toHaveBeenCalled();
  });

  it("checks the audience against TikTok before uploading anything", async () => {
    storedMetadata = settings({ privacy_level: "PUBLIC_TO_EVERYONE" });
    api.creatorInfo.privacyLevelOptions = ["SELF_ONLY"];

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.message).toMatch(/does not currently offer/i);
    }
    // The decisive part: nothing was uploaded to be rejected at the last step.
    expect(initDirectPost).not.toHaveBeenCalled();
    expect(uploadChunk).not.toHaveBeenCalled();
  });

  it("reports a TikTok rejection with its reason", async () => {
    api.status = {
      status: "FAILED",
      postIds: [],
      failReason: "picture_size_check_failed",
      uploadedBytes: 1_000_000,
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_rejected_media");
      expect(result.error.message).toMatch(/picture_size_check_failed/);
    }
  });
});

// ---------------------------------------------------------------------------
// The double-publish guard
// ---------------------------------------------------------------------------

describe("never posting twice", () => {
  it("records the session before a single byte is sent", async () => {
    await tiktokProvider.publish(REQUEST);

    const recordOrder = recordSession.mock.invocationCallOrder[0];
    const uploadOrder = uploadChunk.mock.invocationCallOrder[0];

    expect(recordOrder).toBeLessThan(uploadOrder);
  });

  it("refuses to upload when the session could not be recorded", async () => {
    // Without that row a retry cannot reconcile, and would post a second time.
    recordedSessionId = null;

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.message).toMatch(/twice/i);
    }
    expect(uploadChunk).not.toHaveBeenCalled();
  });

  it("resumes an existing session rather than opening a second one", async () => {
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-direct",
      delivery_mode: "direct_post",
      chunks_sent: 1,
      total_chunk_count: 1,
      chunk_size_bytes: 1_000_000,
      video_size_bytes: 1_000_000,
      status: "uploading",
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(initDirectPost).not.toHaveBeenCalled();
    expect(fetchPublishStatus).toHaveBeenCalled();
    expect(result.outcome).toBe("succeeded");
  });

  it("continues an interrupted upload from the chunk it stopped at", async () => {
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-direct",
      delivery_mode: "direct_post",
      chunks_sent: 2,
      total_chunk_count: 4,
      chunk_size_bytes: 250_000,
      video_size_bytes: 1_000_000,
      status: "uploading",
    };

    await tiktokProvider.publish(REQUEST);

    // Two chunks remained, so two were sent — not four, and not zero.
    expect(uploadChunk).toHaveBeenCalledTimes(2);
    expect(initDirectPost).not.toHaveBeenCalled();
  });

  it("refuses to reuse a session whose delivery mode has changed", async () => {
    // Continuing would reconcile a draft as a post, or the reverse.
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-inbox",
      delivery_mode: "inbox",
      chunks_sent: 1,
      total_chunk_count: 1,
      chunk_size_bytes: 1_000_000,
      video_size_bytes: 1_000_000,
      status: "processing",
    };

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.message).toMatch(/delivery mode changed/i);
    }
  });

  it("fails rather than resuming an upload whose URL cannot be read", async () => {
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-direct",
      delivery_mode: "direct_post",
      chunks_sent: 0,
      total_chunk_count: 2,
      chunk_size_bytes: 500_000,
      video_size_bytes: 1_000_000,
      status: "initialised",
    };
    storedUploadUrl = null;

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    expect(uploadChunk).not.toHaveBeenCalled();
  });

  it("reconciles a recorded publication without asking TikTok again", async () => {
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-direct",
      delivery_mode: "direct_post",
      status: "published",
      external_post_id: "7300000000000000000",
      chunks_sent: 1,
      total_chunk_count: 1,
      chunk_size_bytes: 1_000_000,
      video_size_bytes: 1_000_000,
    };

    const result = await tiktokProvider.reconcile(REQUEST.idempotencyKey);

    expect(result?.externalPostId).toBe("7300000000000000000");
    expect(fetchPublishStatus).not.toHaveBeenCalled();
  });

  it("reconciles nothing for an inbox session, however far it got", async () => {
    existingSession = {
      id: "session-1",
      owner_id: "owner-1",
      publish_id: "p-inbox",
      delivery_mode: "inbox",
      status: "uploaded_to_draft",
      external_post_id: null,
      chunks_sent: 1,
      total_chunk_count: 1,
      chunk_size_bytes: 1_000_000,
      video_size_bytes: 1_000_000,
    };

    expect(await tiktokProvider.reconcile(REQUEST.idempotencyKey)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

describe("readiness", () => {
  it("refuses a direct post when the publish permission was not granted", async () => {
    clientTables.social_accounts = [
      { ...CONNECTED_ACCOUNT, granted_scopes: ["video.upload"] },
    ];

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_permission_revoked");
      expect(result.error.message).toMatch(/draft upload/i);
    }
  });

  it("refuses when the media cannot be fetched, before any TikTok request", async () => {
    mediaAvailable = false;

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("media_source_unavailable");
    }
    expect(initDirectPost).not.toHaveBeenCalled();
  });

  it("refuses when no settings have been saved", async () => {
    storedMetadata = null;

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.message).toMatch(/no tiktok settings/i);
    }
  });

  it("stands the account down when its credential cannot be renewed", async () => {
    credentialOk = false;

    const result = await tiktokProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_permission_revoked");
      expect(result.error.message).toMatch(/reconnect/i);
    }
  });
});
