// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import {
  canPublishMediaType,
  FIRST_COMMENT_AUTOMATED,
  INSTAGRAM_LIMITS,
  INSTAGRAM_SCOPES,
  MEDIA_DELIVERY,
  PUBLISH_SCOPE,
  STORIES_SUPPORTED,
} from "@/lib/instagram/config";
import {
  categoryForMetaCode,
  categoryForStatus,
  classifyInstagramError,
  metaErrorCode,
} from "@/lib/instagram/errors";
import {
  buildCaption,
  countHashtags,
  countMentions,
  instagramSettingsDigest,
  scriptureBlock,
  validateForInstagram,
} from "@/lib/instagram/metadata";
import {
  buildInstagramAuthorizationUrl,
  canPublish,
  InstagramOAuthError,
  parseLongLivedToken,
} from "@/lib/instagram/oauth";
import { mapContainerStatus, permalinkFrom } from "@/lib/instagram/types";
import type { InstagramMediaMetadata } from "@/lib/instagram/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * Instagram publishing.
 *
 * Two invariants carry most of the weight:
 *
 * 1. **A container is not a post.** Only Meta's media id proves publication.
 * 2. **Images and carousels are refused by design.** They would need media on
 *    a publicly reachable URL, and this application will not expose media to
 *    the open internet to satisfy a platform's fetch model.
 */

const NOW = new Date("2026-08-11T12:00:00Z");

const VARIANT: PlatformVariant = {
  id: "variant-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  platform: "instagram",
  variant_type: "instagram_reel",
  title: null,
  caption: "A word for today.",
  description: null,
  hashtags: ["promises", "faith"],
  first_comment: "More in the description.",
  cta: "Follow for daily promises.",
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
  content_type: "instagram_reel",
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

function metadata(
  overrides: Partial<InstagramMediaMetadata> = {},
): InstagramMediaMetadata {
  return {
    id: "meta-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    media_type: "reels",
    cover_media_asset_id: null,
    share_to_feed: true,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("what Instagram will and will not publish", () => {
  it("publishes Reels, because their bytes can be uploaded directly", () => {
    expect(canPublishMediaType("reels")).toBe(true);
    expect(MEDIA_DELIVERY.reels.detail).toMatch(/directly/i);
  });

  it("refuses images and carousels, and says why", () => {
    for (const type of ["image", "carousel"] as const) {
      expect(canPublishMediaType(type), type).toBe(false);
      expect(MEDIA_DELIVERY[type].detail, type).toMatch(
        /publicly reachable URL/i,
      );
    }
  });

  it("does not implement Stories", () => {
    expect(STORIES_SUPPORTED).toBe(false);
  });

  it("does not automate the first comment", () => {
    // It needs a comment-management permission this app does not request.
    expect(FIRST_COMMENT_AUTOMATED).toBe(false);
  });

  it("refuses an image variant at validation, before anything is sent", () => {
    const problems = validateForInstagram({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata({ media_type: "image" }),
    });

    expect(problems.map((p) => p.code)).toContain("media_source_unavailable");
  });
});

describe("a container is not a post", () => {
  it("never maps an unfamiliar status to finished", () => {
    // `finished` is what permits a publish call, so an unknown value must
    // never reach it.
    expect(mapContainerStatus("IN_PROGRESS")).toBe("in_progress");
    expect(mapContainerStatus("something-new")).toBe("in_progress");
    expect(mapContainerStatus(null)).toBe("in_progress");
    expect(mapContainerStatus("FINISHED")).toBe("finished");
    expect(mapContainerStatus("ERROR")).toBe("error");
    expect(mapContainerStatus("EXPIRED")).toBe("expired");
  });

  it("refuses to invent a permalink from a media id", () => {
    // An Instagram URL uses a shortcode, not the media id. A constructed link
    // would look like proof and lead nowhere.
    expect(permalinkFrom({})).toBeNull();
    expect(permalinkFrom({ permalink: null })).toBeNull();
    expect(permalinkFrom({ permalink: "not-a-url" })).toBeNull();
    expect(
      permalinkFrom({ permalink: "https://www.instagram.com/p/abc/" }),
    ).toBe("https://www.instagram.com/p/abc/");
  });

  it("records a published container only with a media id", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260810140000_create_drive_and_instagram.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /instagram_containers_published_requires_media_id[\s\S]*?status <> 'published' or published_media_id is not null/,
    );
  });

  it("keeps the container table unreachable from the browser", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260810140000_create_drive_and_instagram.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "alter table public.instagram_publish_containers enable row level security",
    );
    expect(migration).toContain(
      "revoke all on public.instagram_publish_containers from authenticated",
    );
    expect(migration).not.toMatch(
      /create policy[^;]*on public\.instagram_publish_containers/i,
    );
  });
});

describe("the provider's ordering", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/instagram/provider.ts"),
    "utf8",
  );

  it("checks for an existing published container before anything else", () => {
    const findIndex = source.indexOf("findContainer(");
    const createIndex = source.indexOf("createReelContainer(");

    expect(findIndex).toBeGreaterThan(-1);
    expect(findIndex).toBeLessThan(createIndex);
  });

  it("records the container before publishing it", () => {
    // The gap between creating and publishing is where a worker can die.
    const recordIndex = source.indexOf("recordContainer(");
    const publishIndex = source.indexOf("publishContainer(");

    expect(recordIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeLessThan(publishIndex);
  });

  it("resolves media before contacting Meta", () => {
    const mediaIndex = source.indexOf("resolveMediaSource(asset)");
    const createIndex = source.indexOf("createReelContainer(");

    expect(mediaIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeLessThan(createIndex);
  });

  it("returns no fabricated external post id", () => {
    const fabricated = source.match(
      /externalPostId:\s*["'`](?!.*\$\{)[^"'`]+["'`]/g,
    );

    expect(fabricated).toBeNull();
  });

  it("writes no token to a log", () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error)/);
  });
});

describe("captions", () => {
  it("keeps Scripture separate from commentary and hashtags", () => {
    const blocks = buildCaption(VARIANT, ITEM).split("\n\n");

    expect(blocks[0]).toBe("A word for today.");
    expect(blocks[1]).toContain(ITEM.scripture_text as string);
    expect(blocks[2]).toBe("Follow for daily promises.");
    expect(blocks[3]).toBe("#promises #faith");
  });

  it("quotes the verse and reference exactly", () => {
    const block = scriptureBlock(ITEM);

    expect(block).toContain(ITEM.scripture_text as string);
    expect(block).toContain("2 Peter 1:4 KJV");
  });

  it("quotes a reference alone when no verse text is stored", () => {
    expect(scriptureBlock({ ...ITEM, scripture_text: null })).toBe(
      "2 Peter 1:4 (KJV)",
    );
  });

  it("counts hashtags and mentions the way the limits are expressed", () => {
    expect(countHashtags("#one #two and #three")).toBe(3);
    expect(countMentions("@alpha and @beta")).toBe(2);
  });

  it("refuses a caption longer than Instagram allows", () => {
    const problems = validateForInstagram({
      variant: { ...VARIANT, caption: "x".repeat(3000) },
      item: ITEM,
      metadata: metadata(),
    });

    expect(
      problems.some((p) =>
        p.message.includes(String(INSTAGRAM_LIMITS.captionCharacters)),
      ),
    ).toBe(true);
  });

  it("refuses more hashtags than Instagram allows", () => {
    const problems = validateForInstagram({
      variant: {
        ...VARIANT,
        hashtags: Array.from({ length: 40 }, (_, i) => `tag${i}`),
      },
      item: ITEM,
      metadata: metadata(),
    });

    expect(problems.some((p) => /hashtags/i.test(p.message))).toBe(true);
  });

  it("refuses a variant with nothing to say", () => {
    const problems = validateForInstagram({
      variant: {
        ...VARIANT,
        caption: null,
        description: null,
        cta: null,
        hashtags: [],
      },
      item: {
        ...ITEM,
        scripture_text: null,
        scripture_reference: null,
      },
      metadata: metadata(),
    });

    expect(problems.some((p) => /nothing to post/i.test(p.message))).toBe(true);
  });

  it("refuses a variant with no settings saved", () => {
    const problems = validateForInstagram({
      variant: VARIANT,
      item: ITEM,
      metadata: null,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe("invalid_content");
  });
});

describe("approval covers Instagram settings", () => {
  it("is null when nothing is saved, so saving is itself a change", () => {
    expect(instagramSettingsDigest(null)).toBeNull();
  });

  it("changes when the media type changes", () => {
    expect(instagramSettingsDigest(metadata({ media_type: "image" }))).not.toBe(
      instagramSettingsDigest(metadata()),
    );
  });

  it("changes when the cover changes", () => {
    expect(
      instagramSettingsDigest(metadata({ cover_media_asset_id: "asset-1" })),
    ).not.toBe(instagramSettingsDigest(metadata()));
  });

  it("does not change when only a timestamp moves", () => {
    expect(
      instagramSettingsDigest(metadata({ updated_at: "2027-01-01T00:00:00Z" })),
    ).toBe(instagramSettingsDigest(metadata()));
  });
});

describe("OAuth", () => {
  const CONFIG = {
    appId: "app-id",
    appSecret: "app-secret",
    redirectUri: "https://example.test/api/oauth/meta/callback",
  };

  it("requests only the two permissions this product needs", () => {
    const url = new URL(buildInstagramAuthorizationUrl(CONFIG, "state-value"));
    const scopes = (url.searchParams.get("scope") ?? "").split(",");

    expect(scopes).toEqual([...INSTAGRAM_SCOPES]);
    expect(scopes).not.toContain("instagram_business_manage_messages");
  });

  it("carries the state and never the app secret", () => {
    const url = buildInstagramAuthorizationUrl(CONFIG, "state-value");

    expect(url).toContain("state=state-value");
    expect(url).not.toContain(CONFIG.appSecret);
  });

  it("recognises a connection that cannot publish", () => {
    expect(canPublish([...INSTAGRAM_SCOPES])).toBe(true);
    expect(canPublish(["instagram_business_basic"])).toBe(false);
    expect(canPublish([])).toBe(false);
    expect(INSTAGRAM_SCOPES).toContain(PUBLISH_SCOPE);
  });

  it("computes an absolute expiry from the long-lived token's lifetime", () => {
    const tokens = parseLongLivedToken(
      { access_token: "IGQ.long-lived", expires_in: 5_184_000 },
      [...INSTAGRAM_SCOPES],
      NOW,
    );

    expect(tokens.accessToken).toBe("IGQ.long-lived");
    expect(tokens.expiresAt.getTime()).toBe(NOW.getTime() + 5_184_000_000);
  });

  it("refuses a token with no lifetime, which could never be refreshed safely", () => {
    expect(() =>
      parseLongLivedToken({ access_token: "IGQ.x" }, [], NOW),
    ).toThrow(InstagramOAuthError);
  });

  it("refuses a response with no token rather than storing an empty one", () => {
    expect(() => parseLongLivedToken({ expires_in: 100 }, [], NOW)).toThrow(
      InstagramOAuthError,
    );
  });
});

describe("the OAuth callback", () => {
  const route = readFileSync(
    join(process.cwd(), "src/app/api/oauth/meta/callback/route.ts"),
    "utf8",
  );

  it("consumes the state before exchanging the code", () => {
    const stateIndex = route.indexOf("consumeOAuthState(");
    const exchangeIndex = route.indexOf("exchangeInstagramCode(");

    expect(stateIndex).toBeGreaterThan(-1);
    expect(stateIndex).toBeLessThan(exchangeIndex);
  });

  it("upgrades to a long-lived token before recording anything", () => {
    // Without this the connection would die within the hour.
    const upgradeIndex = route.indexOf("exchangeForLongLivedToken(");
    const saveIndex = route.indexOf("saveLongLivedConnection(");

    expect(upgradeIndex).toBeGreaterThan(-1);
    expect(upgradeIndex).toBeLessThan(saveIndex);
  });

  it("identifies the account before recording anything", () => {
    const accountIndex = route.indexOf("fetchAccount(");
    const saveIndex = route.indexOf("saveLongLivedConnection(");

    expect(accountIndex).toBeLessThan(saveIndex);
  });

  it("refuses a state issued for a different platform", () => {
    expect(route).toContain('consumed.platform !== "instagram"');
  });

  it("echoes nothing Meta sent back into the redirect", () => {
    expect(route).not.toMatch(/notice=\$\{[^}]*(error|code|state)/);
  });
});

describe("error classification", () => {
  it("reads Meta's numeric code", () => {
    expect(metaErrorCode({ error: { code: 190 } })).toBe(190);
    expect(metaErrorCode({})).toBeNull();
    expect(metaErrorCode(null)).toBeNull();
  });

  it("treats an expired token as a reconnection, not a retry", () => {
    expect(categoryForMetaCode(190)).toBe("provider_permission_revoked");
    expect(categoryForMetaCode(200)).toBe("provider_permission_revoked");
  });

  it("treats rate limits as retryable", () => {
    for (const code of [4, 17, 32, 613]) {
      expect(categoryForMetaCode(code), String(code)).toBe(
        "provider_rate_limited",
      );
    }
  });

  it("returns null for an unfamiliar code, so the status decides", () => {
    expect(categoryForMetaCode(999999)).toBeNull();
  });

  it("defaults an unrecognised failure to non-retryable", () => {
    const safe = classifyInstagramError(418, {});

    expect(safe.retryable).toBe(false);
  });

  it("prefers the code over the status", () => {
    const safe = classifyInstagramError(400, { error: { code: 4 } });

    expect(safe.code).toBe("provider_rate_limited");
    expect(safe.retryable).toBe(true);
  });

  it("maps status codes sensibly when there is no Meta code", () => {
    expect(categoryForStatus(401)).toBe("provider_permission_revoked");
    expect(categoryForStatus(429)).toBe("provider_rate_limited");
    expect(categoryForStatus(503)).toBe("provider_unavailable");
  });

  it("drops the trace id and redacts anything sensitive", () => {
    const safe = classifyInstagramError(400, {
      error: {
        code: 100,
        message: "Bearer IGQ.leaked-token rejected",
        fbtrace_id: "AbCdEf123",
      },
    });

    expect(safe.message).not.toContain("IGQ.leaked-token");
    expect(safe.message).not.toContain("AbCdEf123");
  });
});

describe("the API client", () => {
  it("sends the token as a header, never as a query parameter", async () => {
    // Meta accepts `access_token` in the query string and much example code
    // uses it. A token in a query string is a token in browser history,
    // proxy logs and referrer headers.
    const source = readFileSync(
      join(process.cwd(), "src/lib/instagram/api.ts"),
      "utf8",
    );

    expect(source).toContain("Authorization: `Bearer ${accessToken}`");
    expect(source).not.toMatch(/searchParams\.set\(\s*["']access_token["']/);
  });

  it("creates a resumable container rather than one that fetches a URL", async () => {
    const { createReelContainer } = await import("@/lib/instagram/api");
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "container-1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const id = await createReelContainer(
      { accessToken: "IGQ.token", fetchImpl: fetchImpl as never },
      {
        igUserId: "ig-1",
        caption: "A word for today.",
        shareToFeed: true,
        fileSizeBytes: 100,
      },
    );

    expect(id).toBe("container-1");

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = String(init.body);
    expect(body).toContain("upload_type=resumable");
    expect(body).toContain("media_type=REELS");
    // The whole point: no URL for Meta to fetch.
    expect(body).not.toContain("video_url");
    expect(body).not.toContain("image_url");
  });

  it("refuses a publish response with no media id", async () => {
    const { publishContainer } = await import("@/lib/instagram/api");
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      publishContainer(
        { accessToken: "IGQ.token", fetchImpl: fetchImpl as never },
        "ig-1",
        "container-1",
      ),
    ).rejects.toThrow();
  });
});
