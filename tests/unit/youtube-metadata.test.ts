// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import type { PlatformVariant } from "@/lib/variants/types";
import {
  REQUESTABLE_PRIVACY_STATUSES,
  SCHEDULED_RELEASE_AVAILABLE,
  SHORTS_CLASSIFICATION_IS_AUTOMATIC,
  UPLOADS_PER_DEFAULT_QUOTA,
  YOUTUBE_LIMITS,
  isRequestablePrivacy,
} from "@/lib/youtube/config";
import {
  buildDescription,
  buildVideoResource,
  byteLength,
  defaultMetadataFor,
  scriptureBlock,
  tagsLength,
  validateForYouTube,
  youtubeSettingsDigest,
} from "@/lib/youtube/metadata";
import {
  parseYouTubeMetadataForm,
  youtubeValuesFrom,
} from "@/lib/youtube/schema";
import type { YouTubeVideoMetadata } from "@/lib/youtube/types";

/**
 * Turning stored content into a YouTube upload.
 *
 * Two rules carry most of the weight here, and both are project rules rather
 * than YouTube's: Scripture stays distinguishable from commentary, and nothing
 * is invented — not a title, and above all not the made-for-kids declaration.
 */

const VARIANT: PlatformVariant = {
  id: "variant-1",
  owner_id: "owner-1",
  content_item_id: "item-1",
  platform: "youtube",
  variant_type: "youtube_short",
  title: "Precious promises",
  caption: "A word for today.",
  description: "The promise that carried me this week.",
  hashtags: ["promises"],
  first_comment: null,
  cta: "Subscribe for daily promises.",
  thumbnail_text: null,
  review_state: "ready_for_review",
  approved_at: null,
  approved_by: null,
  approval_hash: null,
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

function metadata(
  overrides: Partial<YouTubeVideoMetadata> = {},
): YouTubeVideoMetadata {
  return {
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
    ...overrides,
  };
}

describe("the Scripture block", () => {
  it("quotes the stored verse and its reference exactly", () => {
    const block = scriptureBlock(ITEM);

    expect(block).toContain(ITEM.scripture_text as string);
    expect(block).toContain("2 Peter 1:4 KJV");
  });

  it("keeps the verse text and the attribution on separate lines", () => {
    // Folding the reference into the verse would blur where the verified text
    // ends, which is the whole point of tracking verification.
    const [verse, attribution] = (scriptureBlock(ITEM) ?? "").split("\n");

    expect(verse).toBe(ITEM.scripture_text);
    expect(attribution).toBe("— 2 Peter 1:4 KJV");
  });

  it("quotes a reference alone when no verse text is stored", () => {
    // Filling in the verse from memory is exactly what this project forbids.
    const block = scriptureBlock({ ...ITEM, scripture_text: null });

    expect(block).toBe("2 Peter 1:4 (KJV)");
  });

  it("returns null when there is no Scripture at all", () => {
    expect(
      scriptureBlock({
        ...ITEM,
        scripture_text: null,
        scripture_reference: null,
      }),
    ).toBeNull();
  });
});

describe("the description", () => {
  it("keeps commentary, Scripture and the call to action apart", () => {
    const description = buildDescription(VARIANT, ITEM);
    const blocks = description.split("\n\n");

    expect(blocks[0]).toBe(VARIANT.description);
    expect(blocks[1]).toContain(ITEM.scripture_text as string);
    expect(blocks[2]).toBe(VARIANT.cta);
  });

  it("does not merge Scripture into the caption", () => {
    const description = buildDescription(VARIANT, ITEM);

    expect(description).not.toContain(
      `${VARIANT.description} ${ITEM.scripture_text}`,
    );
  });

  it("falls back to the caption when there is no description", () => {
    const description = buildDescription(
      { ...VARIANT, description: null },
      ITEM,
    );

    expect(description.startsWith(VARIANT.caption as string)).toBe(true);
  });

  it("drops empty parts rather than leaving stray blank lines", () => {
    const description = buildDescription(
      { description: null, caption: null, cta: null },
      { ...ITEM, scripture_text: null, scripture_reference: null },
    );

    expect(description).toBe("");
  });

  it("can be built without Scripture when the caller says so", () => {
    const description = buildDescription(VARIANT, ITEM, {
      includeScripture: false,
    });

    expect(description).not.toContain("2 Peter 1:4");
  });

  it("is measured in bytes, as YouTube measures it", () => {
    // An emoji costs four bytes. Counting characters would accept a
    // description the API then rejects.
    expect(byteLength("abc")).toBe(3);
    expect(byteLength("✝")).toBeGreaterThan(1);
  });
});

describe("validation", () => {
  it("passes a complete variant", () => {
    expect(
      validateForYouTube({
        variant: VARIANT,
        item: ITEM,
        metadata: metadata(),
      }),
    ).toEqual([]);
  });

  it("refuses a variant with no title", () => {
    const problems = validateForYouTube({
      variant: { ...VARIANT, title: null },
      item: ITEM,
      metadata: metadata(),
    });

    expect(problems.map((p) => p.code)).toContain("invalid_content");
    expect(problems[0].message).toMatch(/no title/i);
  });

  it("refuses a title longer than YouTube allows", () => {
    const problems = validateForYouTube({
      variant: { ...VARIANT, title: "x".repeat(101) },
      item: ITEM,
      metadata: metadata(),
    });

    expect(problems[0].message).toContain(
      String(YOUTUBE_LIMITS.titleCharacters),
    );
  });

  it("refuses angle brackets, which YouTube rejects outright", () => {
    const problems = validateForYouTube({
      variant: { ...VARIANT, title: "Promises <today>" },
      item: ITEM,
      metadata: metadata(),
    });

    expect(problems.some((p) => p.message.includes("<"))).toBe(true);
  });

  it("refuses tags whose combined length exceeds the limit", () => {
    const problems = validateForYouTube({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata({ tags: ["x".repeat(300), "y".repeat(300)] }),
    });

    expect(problems.some((p) => /tags total/i.test(p.message))).toBe(true);
    expect(tagsLength(["ab", "cd"])).toBe(4);
  });

  it("refuses an unanswered made-for-kids declaration", () => {
    // A legal declaration under COPPA. This system will not answer it.
    const problems = validateForYouTube({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata({ self_declared_made_for_kids: null }),
    });

    expect(problems.some((p) => /made-for-kids/i.test(p.message))).toBe(true);
  });

  it("refuses a variant with no settings saved at all", () => {
    const problems = validateForYouTube({
      variant: VARIANT,
      item: ITEM,
      metadata: null,
    });

    expect(problems.some((p) => /made-for-kids/i.test(p.message))).toBe(true);
  });

  it("refuses a public upload this client cannot actually request", () => {
    const problems = validateForYouTube({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata({ privacy_status: "public" }),
    });

    expect(problems.some((p) => /compliance audit/i.test(p.message))).toBe(
      true,
    );
  });

  it("returns every problem at once, not the first", () => {
    const problems = validateForYouTube({
      variant: { ...VARIANT, title: null },
      item: ITEM,
      metadata: metadata({
        self_declared_made_for_kids: null,
        privacy_status: "public",
      }),
    });

    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe("building the upload body", () => {
  it("sends the title, the description and the declarations", () => {
    const resource = buildVideoResource({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata({ tags: ["promises"], category_id: "22" }),
    });

    expect(resource.snippet.title).toBe("Precious promises");
    expect(resource.snippet.description).toContain("2 Peter 1:4");
    expect(resource.snippet.tags).toEqual(["promises"]);
    expect(resource.snippet.categoryId).toBe("22");
    expect(resource.status.privacyStatus).toBe("private");
    expect(resource.status.selfDeclaredMadeForKids).toBe(false);
  });

  it("throws rather than defaulting the made-for-kids declaration", () => {
    // There is no `?? false` anywhere in the builder, because a default there
    // is an answer nobody gave.
    expect(() =>
      buildVideoResource({
        variant: VARIANT,
        item: ITEM,
        metadata: metadata({ self_declared_made_for_kids: null }),
      }),
    ).toThrow(/made-for-kids/i);
  });

  it("throws rather than inventing a title", () => {
    expect(() =>
      buildVideoResource({
        variant: { ...VARIANT, title: "  " },
        item: ITEM,
        metadata: metadata(),
      }),
    ).toThrow(/no title/i);
  });

  it("omits optional fields rather than sending empty ones", () => {
    const resource = buildVideoResource({
      variant: VARIANT,
      item: ITEM,
      metadata: metadata(),
    });

    expect(resource.snippet.tags).toBeUndefined();
    expect(resource.snippet.categoryId).toBeUndefined();
    expect(resource.snippet.defaultLanguage).toBeUndefined();
  });
});

describe("what this client will not offer", () => {
  it("cannot request a public upload", () => {
    expect([...REQUESTABLE_PRIVACY_STATUSES]).toEqual(["private", "unlisted"]);
    expect(isRequestablePrivacy("public")).toBe(false);
  });

  it("does not offer scheduled release", () => {
    // `publishAt` needs a video that will actually become public. An unaudited
    // client's uploads are forced private, so a scheduled release would
    // promise something that never happens.
    expect(SCHEDULED_RELEASE_AVAILABLE).toBe(false);
  });

  it("does not claim to create a Short", () => {
    // No parameter of videos.insert requests it and no response confirms it.
    // YouTube classifies a Short from the file itself, after processing.
    expect(SHORTS_CLASSIFICATION_IS_AUTOMATIC).toBe(true);
  });

  it("states the real daily upload ceiling", () => {
    expect(UPLOADS_PER_DEFAULT_QUOTA).toBe(6);
  });
});

describe("the approval fingerprint contribution", () => {
  it("is null when nothing has been saved, so saving is itself a change", () => {
    expect(youtubeSettingsDigest(null)).toBeNull();
  });

  it("changes when privacy changes", () => {
    expect(
      youtubeSettingsDigest(metadata({ privacy_status: "unlisted" })),
    ).not.toBe(youtubeSettingsDigest(metadata({ privacy_status: "private" })));
  });

  it("changes when the thumbnail changes", () => {
    expect(
      youtubeSettingsDigest(metadata({ thumbnail_media_asset_id: "asset-1" })),
    ).not.toBe(youtubeSettingsDigest(metadata()));
  });

  it("changes when the made-for-kids answer changes", () => {
    expect(
      youtubeSettingsDigest(metadata({ self_declared_made_for_kids: true })),
    ).not.toBe(
      youtubeSettingsDigest(metadata({ self_declared_made_for_kids: false })),
    );
  });

  it("distinguishes unanswered from answered no", () => {
    expect(
      youtubeSettingsDigest(metadata({ self_declared_made_for_kids: null })),
    ).not.toBe(
      youtubeSettingsDigest(metadata({ self_declared_made_for_kids: false })),
    );
  });

  it("does not change when only a timestamp moves", () => {
    // A volatile value in the fingerprint would invalidate approvals for
    // reasons that have nothing to do with what is published.
    expect(
      youtubeSettingsDigest(metadata({ updated_at: "2027-01-01T00:00:00Z" })),
    ).toBe(youtubeSettingsDigest(metadata()));
  });
});

describe("defaults", () => {
  it("leaves the made-for-kids declaration unanswered", () => {
    const defaults = defaultMetadataFor("owner-1", "variant-1");

    expect(defaults.self_declared_made_for_kids).toBeNull();
    expect(defaults.privacy_status).toBe("private");
  });
});

describe("the settings form", () => {
  function form(values: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      data.set(key, value);
    }
    return data;
  }

  it("parses a complete submission", () => {
    const result = parseYouTubeMetadataForm(
      youtubeValuesFrom(
        form({
          privacy_status: "unlisted",
          self_declared_made_for_kids: "no",
          tags: "promises, peace ,  ",
          notify_subscribers: "on",
        }),
      ),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.privacy_status).toBe("unlisted");
      expect(result.data.self_declared_made_for_kids).toBe(false);
      expect(result.data.tags).toEqual(["promises", "peace"]);
      expect(result.data.notify_subscribers).toBe(true);
      expect(result.data.contains_synthetic_media).toBe(false);
    }
  });

  it("keeps an unanswered declaration unanswered", () => {
    const result = parseYouTubeMetadataForm(
      youtubeValuesFrom(
        form({ privacy_status: "private", self_declared_made_for_kids: "" }),
      ),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.self_declared_made_for_kids).toBeNull();
    }
  });

  it("refuses a public privacy status submitted by hand", () => {
    // The select does not offer it, and a hand-edited form does not get past
    // the server either.
    const result = parseYouTubeMetadataForm(
      youtubeValuesFrom(
        form({ privacy_status: "public", self_declared_made_for_kids: "no" }),
      ),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.privacy_status).toBeDefined();
    }
  });

  it("treats an omitted field as absent rather than failing", () => {
    // FormData.get returns null for a field that was never submitted.
    const result = parseYouTubeMetadataForm(
      youtubeValuesFrom(form({ privacy_status: "private" })),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category_id).toBeNull();
      expect(result.data.playlist_id).toBeNull();
      expect(result.data.tags).toEqual([]);
    }
  });
});
