// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import type { PublishRequest } from "@/lib/publishing/providers";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The YouTube provider, exercised rather than read.
 *
 * The other provider test asserts things about the source — call ordering, no
 * fabricated ids. This one runs `publish()` against a fake database and a fake
 * Google, and checks what it actually returns.
 *
 * The decisive case is `media_source_unavailable`: a fully connected account,
 * valid metadata, an attached video asset — and still a refusal, because there
 * is no way to obtain the file. That refusal is the honest centre of Stage 7,
 * so it is tested as behaviour and not as a comment.
 */

/**
 * A minimal Supabase query stub.
 *
 * Every filter method returns itself; the terminal ones resolve with whatever
 * this table was seeded with. Enough to drive the provider, and far less
 * machinery than standing up a real client for what are ultimately branch
 * tests.
 */
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

// The provider reads server config once it gets past the media check. Setting
// this lets the "media no longer blocks" test reach that far without an
// environment error masking the result.
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

let driveResult: unknown = {
  ok: false,
  refusal: "not_connected",
};

vi.mock("@/lib/drive/storage", () => ({
  driveStorage: {
    open: async () => driveResult,
    describe: async () => driveResult,
    isConnected: async () => driveResult !== null,
  },
  GoogleDriveStorageProvider: class {},
}));

vi.mock("@/lib/youtube/server-config", () => ({
  resolveYouTubeConfig: () => ({
    config: configured
      ? {
          clientId: "test-client-id",
          clientSecret: "test-client-secret",
          redirectUri: "https://example.test/api/oauth/google/callback",
        }
      : null,
    problems: configured ? [] : ["GOOGLE_CLIENT_ID is not set."],
  }),
  isYouTubeConfigured: () => configured,
}));

// Imported after the mocks so the provider picks them up.
const { youtubeProvider } = await import("@/lib/youtube/provider");

const UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

const VARIANT: PlatformVariant = {
  id: "variant-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  platform: "youtube",
  variant_type: "youtube_short",
  title: "Precious promises",
  caption: "A word for today.",
  description: "The promise that carried me this week.",
  hashtags: [],
  first_comment: null,
  cta: null,
  thumbnail_text: null,
  review_state: "approved",
  approved_at: "2026-08-08T00:00:00Z",
  approved_by: "owner-1",
  approval_hash: "a".repeat(64),
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

const ITEM: ContentItem = {
  id: "item-1",
  owner_id: "owner-1",
  title: "A promise for today",
  content_type: "youtube_short",
  topic: null,
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises",
  scripture_translation: "KJV",
  scripture_verification_status: "manually_verified",
  scripture_verified_at: "2026-08-08T00:00:00Z",
  scripture_verified_by: "owner-1",
  description: null,
  status: "draft",
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

const POST = {
  id: "post-1",
  owner_id: "owner-1",
  platform_variant_id: "variant-1",
} as ScheduledPost;

const REQUEST: PublishRequest = {
  scheduledPost: POST,
  variant: VARIANT,
  item: ITEM,
  idempotencyKey: "pp_publish_youtube_abc123def456",
};

const CONNECTED_ACCOUNT = {
  id: "account-1",
  owner_id: "owner-1",
  platform: "youtube",
  provider_account_id: "UC_channel",
  channel_id: "UC_channel",
  channel_title: "Precious Promises",
  status: "connected",
  granted_scopes: [UPLOAD_SCOPE],
  connected_at: "2026-08-08T00:00:00Z",
  disconnected_at: null,
  token_expires_at: null,
  display_name: null,
  handle: null,
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

const VALID_METADATA = {
  id: "meta-1",
  owner_id: "owner-1",
  platform_variant_id: "variant-1",
  category_id: null,
  default_language: null,
  default_audio_language: null,
  tags: [],
  privacy_status: "private",
  self_declared_made_for_kids: false,
  contains_synthetic_media: false,
  notify_subscribers: true,
  playlist_id: null,
  thumbnail_media_asset_id: null,
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

const VIDEO_ASSET = {
  id: "asset-1",
  owner_id: "owner-1",
  name: "Promise short",
  media_type: "video",
  storage_provider: "google_drive",
  external_file_id: "drive-file-1",
  external_url: null,
  mime_type: "video/mp4",
  size_bytes: 12_000_000,
  width: 1080,
  height: 1920,
  duration_seconds: 45,
  rights_status: "owned",
  created_at: "2026-08-08T00:00:00Z",
  updated_at: "2026-08-08T00:00:00Z",
};

/** Everything present and correct — the closest this system can get today. */
function fullyReady(): Record<string, unknown> {
  return {
    youtube_upload_sessions: null,
    social_accounts: [CONNECTED_ACCOUNT],
    youtube_video_metadata: VALID_METADATA,
    content_media: [
      { media_asset_id: "asset-1", purpose: "primary", sort_order: 0 },
    ],
    media_assets: VIDEO_ASSET,
  };
}

/** A Drive file that genuinely resolves to streamable bytes. */
const RESOLVED_DRIVE_MEDIA = {
  ok: true,
  value: {
    contentType: "video/mp4",
    contentLength: 12_000_000,
    filename: "promise-short.mp4",
    open: async () => new Response("video-bytes"),
  },
};

beforeEach(() => {
  configured = true;
  clientTables = fullyReady();
  driveResult = { ok: false, refusal: "not_connected" };
});

describe("media resolution decides whether an upload happens", () => {
  it("refuses when Drive is not connected", async () => {
    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_not_connected");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("refuses a file outside the approved Drive folder", async () => {
    // The boundary that matters most: a media asset can be edited to point at
    // any Drive id, so containment is re-proved at publish time.
    driveResult = { ok: false, refusal: "outside_root" };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.message).toMatch(/approved/i);
    }
  });

  it("refuses a file that has been put in the Drive bin", async () => {
    driveResult = { ok: false, refusal: "trashed" };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
  });

  it("reports the problem through validateReadiness too, before anything runs", async () => {
    driveResult = { ok: false, refusal: "outside_root" };

    const problems = await youtubeProvider.validateReadiness(REQUEST);

    expect(problems.length).toBeGreaterThan(0);
  });

  it("gets past the media check entirely once Drive resolves real bytes", async () => {
    // Stage 8's whole point. With a genuine media source the provider stops
    // refusing on media and moves on to credentials — which are absent in this
    // test environment, so it fails there instead. That the failure moved is
    // the assertion: media is no longer what blocks a YouTube upload.
    driveResult = RESOLVED_DRIVE_MEDIA;

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).not.toBe("media_source_unavailable");
      expect(result.error.code).not.toBe("missing_asset");
      // It reached the credential step.
      expect(result.error.code).toBe("provider_not_connected");
    }
  });
});

describe("connection state decides whether anything is attempted", () => {
  it("refuses when no account exists", async () => {
    clientTables = { ...fullyReady(), social_accounts: [] };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_not_connected");
    }
  });

  it("refuses an account the platform has stopped accepting", async () => {
    clientTables = {
      ...fullyReady(),
      social_accounts: [{ ...CONNECTED_ACCOUNT, status: "needs_reconnect" }],
    };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_permission_revoked");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("refuses a connection granted without upload permission", async () => {
    // Google's consent screen lets scopes be unticked individually.
    clientTables = {
      ...fullyReady(),
      social_accounts: [{ ...CONNECTED_ACCOUNT, granted_scopes: [] }],
    };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_permission_revoked");
    }
  });

  it("reports not connected when the worker credential is absent", async () => {
    configured = false;

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("provider_not_connected");
    }
    expect(await youtubeProvider.isConnected()).toBe(false);
  });

  it("reports connected only when an account row says so", async () => {
    expect(await youtubeProvider.isConnected()).toBe(true);

    clientTables = { ...fullyReady(), social_accounts: [] };
    expect(await youtubeProvider.isConnected()).toBe(false);
  });
});

describe("content problems stop before the media check", () => {
  it("refuses an unanswered made-for-kids declaration", async () => {
    clientTables = {
      ...fullyReady(),
      youtube_video_metadata: {
        ...VALID_METADATA,
        self_declared_made_for_kids: null,
      },
    };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("invalid_content");
      expect(result.error.message).toMatch(/made-for-kids/i);
    }
  });

  it("refuses a variant with no YouTube settings saved at all", async () => {
    clientTables = { ...fullyReady(), youtube_video_metadata: null };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("invalid_content");
    }
  });

  it("refuses a title YouTube would reject, without sending it", async () => {
    const result = await youtubeProvider.publish({
      ...REQUEST,
      variant: { ...VARIANT, title: "x".repeat(101) },
    });

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("invalid_content");
    }
  });
});

describe("media that is attached but not a video", () => {
  it("refuses when nothing is attached", async () => {
    clientTables = { ...fullyReady(), content_media: [], media_assets: null };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("missing_asset");
    }
  });

  it("refuses an audio asset where a video is needed", async () => {
    clientTables = {
      ...fullyReady(),
      media_assets: { ...VIDEO_ASSET, media_type: "audio" },
    };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.error.code).toBe("missing_asset");
    }
  });
});

describe("a video that already exists is never uploaded twice", () => {
  const completedSession = {
    id: "session-1",
    owner_id: "owner-1",
    scheduled_post_id: "post-1",
    idempotency_key: REQUEST.idempotencyKey,
    bytes_total: 12_000_000,
    bytes_sent: 12_000_000,
    video_id: "vid_already_there",
    status: "completed",
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
  };

  it("returns the existing video id instead of publishing again", async () => {
    // The decisive double-publish guard: this runs before the account check,
    // before metadata, before media.
    clientTables = {
      ...fullyReady(),
      youtube_upload_sessions: completedSession,
    };

    const result = await youtubeProvider.publish(REQUEST);

    expect(result.outcome).toBe("succeeded");
    if (result.outcome === "succeeded") {
      expect(result.externalPostId).toBe("vid_already_there");
      expect(result.externalPostUrl).toBe(
        "https://www.youtube.com/watch?v=vid_already_there",
      );
    }
  });

  it("answers the same question through reconcile", async () => {
    clientTables = {
      ...fullyReady(),
      youtube_upload_sessions: completedSession,
    };

    const found = await youtubeProvider.reconcile(REQUEST.idempotencyKey);

    expect(found?.externalPostId).toBe("vid_already_there");
  });

  it("reconciles to null rather than guessing that a post exists", async () => {
    expect(await youtubeProvider.reconcile(REQUEST.idempotencyKey)).toBeNull();
  });

  it("does not treat an open session as a success", async () => {
    // An open session means bytes may have started. It is not a video id.
    clientTables = {
      ...fullyReady(),
      youtube_upload_sessions: {
        ...completedSession,
        status: "open",
        video_id: null,
      },
    };

    expect(await youtubeProvider.reconcile(REQUEST.idempotencyKey)).toBeNull();

    const result = await youtubeProvider.publish(REQUEST);
    expect(result.outcome).toBe("failed");
  });
});

describe("preparePayload", () => {
  it("builds what would be sent, with no credential in it", async () => {
    const payload = (await youtubeProvider.preparePayload(REQUEST)) as {
      snippet: { title: string; description: string };
      status: { privacyStatus: string; selfDeclaredMadeForKids: boolean };
    };

    expect(payload.snippet.title).toBe("Precious promises");
    expect(payload.snippet.description).toContain("2 Peter 1:4");
    expect(payload.status.privacyStatus).toBe("private");
    expect(JSON.stringify(payload)).not.toMatch(/token|secret|Bearer/i);
  });

  it("returns null rather than a half-built body when nothing is saved", async () => {
    clientTables = { ...fullyReady(), youtube_video_metadata: null };

    expect(await youtubeProvider.preparePayload(REQUEST)).toBeNull();
  });
});
