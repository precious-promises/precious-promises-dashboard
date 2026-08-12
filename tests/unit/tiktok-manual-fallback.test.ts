// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import { QUEUE_SECTIONS } from "@/lib/publishing/repository";
import { buildCaption } from "@/lib/tiktok/metadata";
import { buildManualPostKit } from "@/lib/tiktok/manual";
import type { TikTokVideoMetadata } from "@/lib/tiktok/types";
import { UNPUBLISHED_OUTCOME_STATUSES } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The manual posting fallback.
 *
 * It exists because TikTok's direct posting needs an audit this application
 * may not have. The rule it must never break: **preparing a post is not
 * publishing one.** Nothing here sends anything, and nothing here may read as
 * though it did.
 */

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
    disable_comment: true,
    disable_duet: false,
    disable_stitch: false,
    is_commercial_content: false,
    is_branded_content: false,
    is_your_brand: false,
    delivery_mode: "manual",
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    owner_id: "owner-1",
    name: "promise-short.mp4",
    media_type: "video",
    storage_provider: "google_drive",
    external_file_id: "drive-1",
    external_url: null,
    mime_type: "video/mp4",
    size_bytes: 12_000_000,
    width: 1080,
    height: 1920,
    duration_seconds: 45,
    rights_status: "owned",
    source_folder_id: null,
    source_verified_at: null,
    created_at: "2026-08-10T00:00:00Z",
    updated_at: "2026-08-10T00:00:00Z",
    ...overrides,
  } as MediaAsset;
}

function kit(
  overrides: {
    metadata?: TikTokVideoMetadata | null;
    asset?: MediaAsset | null;
    variant?: PlatformVariant;
  } = {},
) {
  return buildManualPostKit({
    variant: overrides.variant ?? VARIANT,
    item: ITEM,
    metadata:
      overrides.metadata === undefined ? metadata() : overrides.metadata,
    asset: overrides.asset === undefined ? asset() : overrides.asset,
  });
}

describe("the manual posting kit", () => {
  it("carries the identical caption an automated post would have sent", () => {
    // The whole point. A retyped Scripture quotation is a silently altered
    // one, so the manual path uses the very same builder.
    expect(kit().caption).toBe(buildCaption(VARIANT, ITEM));
  });

  it("keeps the Scripture block intact and attributed", () => {
    const caption = kit().caption;

    expect(caption).toContain(
      "Whereby are given unto us exceeding great and precious promises",
    );
    expect(caption).toContain("2 Peter 1:4 KJV");
  });

  it("names the file and where it lives, without minting a URL", () => {
    const media = kit().media;

    expect(media.filename).toBe("promise-short.mp4");
    expect(media.ready).toBe(true);
    expect(media.location).toMatch(/Google Drive/);
    // A link here would be either useless or a public exposure.
    expect(media.location).not.toMatch(/https?:\/\//);
    expect(JSON.stringify(kit())).not.toMatch(/https?:\/\//);
  });

  it("says plainly when there is no media to post", () => {
    const media = kit({ asset: null }).media;

    expect(media.ready).toBe(false);
    expect(media.reason).toMatch(/attach the video/i);
  });

  it("refuses to locate a file in a provider it cannot read", () => {
    const media = kit({
      asset: asset({ storage_provider: "supabase_storage" }),
    }).media;

    expect(media.ready).toBe(false);
    expect(media.reason).toMatch(/approved Google Drive folder/i);
  });

  it("lists the interaction settings that have to be set by hand", () => {
    const settings = kit().settings;
    const comments = settings.find((s) => s.label === "Comments");

    expect(comments?.value).toBe("Off");
    expect(settings.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Audience", "Duet", "Stitch"]),
    );
  });

  it("marks the commercial disclosure as a declaration, not a preference", () => {
    const settings = kit({
      metadata: metadata({ is_commercial_content: true, is_your_brand: true }),
    }).settings;

    const commercial = settings.find((s) => s.label === "Commercial content");
    expect(commercial?.declaration).toBe(true);
    expect(commercial?.value).toBe("Declared");
  });

  it("tells the owner to set TikTok's own disclosure toggle", () => {
    // Recording it here does not set it there, and the checklist says so.
    const steps = kit({
      metadata: metadata({ is_commercial_content: true }),
    }).checklist.join(" ");

    expect(steps).toMatch(/legal declaration/i);
  });

  it("refuses to choose an audience when none was recorded", () => {
    const built = kit({ metadata: metadata({ privacy_level: null }) });

    expect(built.settings.find((s) => s.label === "Audience")?.value).toMatch(
      /not chosen/i,
    );
    expect(built.checklist.join(" ")).toMatch(/will not choose one for you/i);
  });

  it("ends by asking the owner to confirm the Scripture before posting", () => {
    expect(kit().checklist.join(" ")).toMatch(/reads exactly as approved/i);
  });

  it("never describes itself as published", () => {
    const text = JSON.stringify(kit()).toLowerCase();

    expect(text).not.toContain("published");
    expect(text).not.toContain("posted to tiktok");
  });

  it("says there is no caption rather than inventing one", () => {
    const built = kit({
      variant: {
        ...VARIANT,
        caption: null,
        description: null,
        cta: null,
        hashtags: [],
      },
    });

    // Scripture alone still produces a caption, so strip that too.
    const empty = buildManualPostKit({
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
      asset: asset(),
    });

    expect(built.hashtags).toEqual([]);
    expect(empty.caption).toBe("");
    expect(empty.checklist.join(" ")).toMatch(/no caption/i);
  });
});

describe("the queue shows incomplete outcomes", () => {
  it("gives both incomplete outcomes a section", () => {
    // A status missing from QUEUE_SECTIONS is a row nobody can see. Both of
    // these were invisible until Stage 9 gave them somewhere to appear.
    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      expect([...QUEUE_SECTIONS], status).toContain(status);
    }
  });

  it("puts them before Posted, where work still remains", () => {
    const sections = [...QUEUE_SECTIONS];
    const posted = sections.indexOf("posted");

    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      expect(sections.indexOf(status), status).toBeLessThan(posted);
    }
  });
});
