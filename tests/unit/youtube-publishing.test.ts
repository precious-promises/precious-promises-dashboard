// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATUSES,
  accountLabel,
  isPublishable,
  needsRefresh,
  TOKEN_REFRESH_SKEW_SECONDS,
  type SocialAccount,
} from "@/lib/accounts/types";
import {
  ERROR_CATEGORIES,
  isRetryable,
  RETRYABLE_CATEGORIES,
  safeError,
} from "@/lib/publishing/errors";
import type { MediaAsset } from "@/lib/media/types";
import {
  MEDIA_RETRIEVAL_AVAILABLE,
  MEDIA_RETRIEVAL_DETAIL,
  resolveMediaSource,
} from "@/lib/youtube/media-source";
import { youtubeProvider } from "@/lib/youtube/provider";

/**
 * The honest centre of Stage 7.
 *
 * A real YouTube adapter now exists, and it makes real requests. What it
 * cannot do is upload, because no integration can fetch a video file — and
 * these tests hold that this is reported as a refusal rather than papered over
 * with a stub, a fabricated post id, or an empty upload.
 */

const NOW = new Date("2026-08-11T12:00:00Z");

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
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
    ...overrides,
  };
}

function account(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: "account-1",
    owner_id: "owner-1",
    platform: "youtube",
    provider_account_id: "UC_channel",
    display_name: null,
    handle: "@promises",
    channel_id: "UC_channel",
    channel_title: "Precious Promises",
    status: "connected",
    granted_scopes: [],
    connected_at: "2026-08-08T00:00:00Z",
    disconnected_at: null,
    token_expires_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("no media can be uploaded", () => {
  it("refuses every storage provider, with the reason each one is blocked", () => {
    for (const provider of [
      "google_drive",
      "supabase_storage",
      "external",
    ] as const) {
      const result = resolveMediaSource(asset({ storage_provider: provider }));

      expect(result.available, provider).toBe(false);
      if (!result.available) {
        expect(result.error.code, provider).toBe("media_source_unavailable");
        // Each branch names its own missing piece of work rather than giving
        // one blanket refusal that hides which is blocking this upload.
        expect(result.error.message.length, provider).toBeGreaterThan(40);
      }
    }
  });

  it("is a non-retryable refusal, because retrying changes nothing", () => {
    const result = resolveMediaSource(asset());

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.error.retryable).toBe(false);
    }
  });

  it("distinguishes a missing asset from an unfetchable one", () => {
    const missing = resolveMediaSource(null);

    expect(missing.available).toBe(false);
    if (!missing.available) {
      expect(missing.error.code).toBe("missing_asset");
    }
  });

  it("refuses an asset of the wrong type", () => {
    const result = resolveMediaSource(asset({ media_type: "audio" }));

    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.error.code).toBe("missing_asset");
    }
  });

  it("says so once, in one place, so every surface agrees", () => {
    expect(MEDIA_RETRIEVAL_AVAILABLE).toBe(false);
    expect(MEDIA_RETRIEVAL_DETAIL).toContain("media_source_unavailable");
  });

  it("registers media_source_unavailable as a real, non-retryable category", () => {
    expect(ERROR_CATEGORIES).toContain("media_source_unavailable");
    expect(isRetryable("media_source_unavailable")).toBe(false);
    expect([...RETRYABLE_CATEGORIES]).not.toContain("media_source_unavailable");
    expect(
      safeError("media_source_unavailable").message.length,
    ).toBeGreaterThan(10);
  });
});

describe("the provider is not a stub", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/youtube/provider.ts"),
    "utf8",
  );

  it("reports success only with a video id from YouTube", () => {
    // Every `outcome: "succeeded"` in the provider is built from a value that
    // came back from the platform — a completed session's `video_id`, or the
    // id `uploadMedia` returned.
    const fabricated = source.match(
      /externalPostId:\s*["'`](?!.*\$\{)[^"'`]+["'`]/g,
    );

    expect(fabricated).toBeNull();
  });

  it("resolves media before contacting Google at all", () => {
    // An upload costs 1,600 of a default 10,000 daily quota units. Failing
    // early on something knowable locally is deliberate, not incidental.
    const mediaIndex = source.indexOf("resolveMediaSource(asset)");
    const credentialIndex = source.indexOf("getLiveCredential(");

    expect(mediaIndex).toBeGreaterThan(-1);
    expect(credentialIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeLessThan(credentialIndex);
  });

  it("checks for an existing upload before starting a new one", () => {
    const reconcileIndex = source.indexOf("findUploadSession(");
    const uploadIndex = source.indexOf("this.uploadVideo(");

    expect(reconcileIndex).toBeGreaterThan(-1);
    expect(reconcileIndex).toBeLessThan(uploadIndex);
  });

  it("records the upload session before sending any bytes", () => {
    // This ordering is what lets a crashed worker ask YouTube what happened
    // instead of uploading a second copy.
    const recordIndex = source.indexOf("recordUploadSession(");
    const sendIndex = source.indexOf("uploadMedia(");

    expect(recordIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeLessThan(sendIndex);
  });

  it("never writes a token into an audit record or a log", () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    expect(source).not.toMatch(/recordAudit\([^)]*accessToken/);
  });

  it("implements the whole provider contract", () => {
    expect(typeof youtubeProvider.isConnected).toBe("function");
    expect(typeof youtubeProvider.validateReadiness).toBe("function");
    expect(typeof youtubeProvider.preparePayload).toBe("function");
    expect(typeof youtubeProvider.publish).toBe("function");
    expect(typeof youtubeProvider.reconcile).toBe("function");
    expect(youtubeProvider.platform).toBe("youtube");
  });

  it("classifies an unfamiliar throwable as non-retryable", () => {
    const classified = youtubeProvider.classifyError(new Error("who knows"));

    expect(classified.code).toBe("unknown");
    expect(classified.retryable).toBe(false);
  });

  it("classifies a transient failure as retryable", () => {
    expect(
      youtubeProvider.classifyError(new Error("connect ETIMEDOUT")).retryable,
    ).toBe(true);
  });
});

describe("account state", () => {
  it("only publishes to a connected account", () => {
    expect(isPublishable(account())).toBe(true);
    expect(isPublishable(account({ status: "needs_reconnect" }))).toBe(false);
    expect(isPublishable(account({ status: "disconnected" }))).toBe(false);
    expect(isPublishable(null)).toBe(false);
  });

  it("covers every status with a label", () => {
    expect(ACCOUNT_STATUSES).toHaveLength(3);
  });

  it("describes an account by what is actually known about it", () => {
    expect(accountLabel(account())).toBe("Precious Promises");
    expect(accountLabel(account({ channel_title: null }))).toBe("@promises");
    expect(
      accountLabel(account({ channel_title: null, handle: null })),
    ).toContain("UC_channel");
  });
});

describe("token refresh timing", () => {
  it("refreshes before expiry, not after", () => {
    // A token that expires mid-upload fails an upload that was otherwise fine.
    const soon = new Date(NOW.getTime() + 30_000).toISOString();

    expect(needsRefresh(soon, NOW)).toBe(true);
    expect(TOKEN_REFRESH_SKEW_SECONDS).toBeGreaterThanOrEqual(30);
  });

  it("leaves a token with plenty of life alone", () => {
    const later = new Date(NOW.getTime() + 3_000_000).toISOString();

    expect(needsRefresh(later, NOW)).toBe(false);
  });

  it("refreshes when nothing is known about the expiry", () => {
    expect(needsRefresh(null, NOW)).toBe(true);
    expect(needsRefresh("not a date", NOW)).toBe(true);
  });
});

describe("credentials stay server-side", () => {
  it("keeps every token field off the browser-facing account type", () => {
    const types = readFileSync(
      join(process.cwd(), "src/lib/accounts/types.ts"),
      "utf8",
    );

    // `SocialAccount` is what a page renders. It must have no field that could
    // hold a token, so rendering the page cannot put one in a payload.
    const socialAccount = types.slice(
      types.indexOf("export interface SocialAccount"),
      types.indexOf("export interface SocialAccountCredentials"),
    );

    expect(socialAccount).not.toMatch(/access_token|refresh_token|session_uri/);
  });

  it("gives the credentials table no browser policy at all", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809120000_create_youtube_connection.sql",
      ),
      "utf8",
    );

    for (const table of [
      "social_account_credentials",
      "oauth_states",
      "youtube_upload_sessions",
    ]) {
      // RLS on with no policy refuses every operation for every row.
      expect(migration, table).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(migration, table).toContain(
        `revoke all on public.${table} from authenticated`,
      );
      expect(migration, table).not.toMatch(
        new RegExp(`create policy[^;]*on public\\.${table}`, "i"),
      );
    }
  });

  it("gives social_accounts no INSERT policy", () => {
    // A browser-inserted account row would be a connection nobody made.
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809120000_create_youtube_connection.sql",
      ),
      "utf8",
    );

    expect(migration).not.toMatch(
      /create policy[^;]*on public\.social_accounts for insert/i,
    );
    expect(migration).toMatch(
      /create policy[^;]*on public\.social_accounts for select/i,
    );
  });

  it("stores the resumable session URI encrypted, because it is a capability", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809120000_create_youtube_connection.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("encrypted_session_uri");
    expect(migration).not.toMatch(/^\s*session_uri\s+text/m);
  });

  it("refuses a completed upload session with no video id", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809120000_create_youtube_connection.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /youtube_upload_sessions_completed_requires_video[\s\S]*?status <> 'completed' or video_id is not null/,
    );
  });

  it("refuses a connected YouTube account with no channel", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809120000_create_youtube_connection.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /social_accounts_youtube_requires_channel[\s\S]*?channel_id is not null/,
    );
  });
});

describe("the OAuth callback", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/oauth/google/callback/route.ts"),
    "utf8",
  );

  it("consumes the state before exchanging the code", () => {
    const stateIndex = route.indexOf("consumeOAuthState(");
    const exchangeIndex = route.indexOf("exchangeCode(");

    expect(stateIndex).toBeGreaterThan(-1);
    expect(stateIndex).toBeLessThan(exchangeIndex);
  });

  it("looks up the channel before recording a connection", () => {
    const channelIndex = route.indexOf("fetchMyChannel(");
    const saveIndex = route.indexOf("saveConnection(");

    expect(channelIndex).toBeGreaterThan(-1);
    expect(channelIndex).toBeLessThan(saveIndex);
  });

  it("refuses a connection granted without upload permission", () => {
    expect(route).toContain("canUpload(");
    expect(route).toContain("scope-refused");
  });

  it("echoes nothing Google sent back into the redirect", () => {
    // A callback URL and its query string end up in browser history and
    // referrer headers.
    expect(route).not.toMatch(/notice=\$\{[^}]*(error|code|state)/);
  });
});
