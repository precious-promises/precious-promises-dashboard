// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  approvalFingerprint,
  canonicaliseApprovalSubject,
  EXCLUDED_FROM_FINGERPRINT,
  fingerprintMatches,
  type ApprovalSubject,
} from "@/lib/approvals/fingerprint";
import { approvalSubjectFrom } from "@/lib/approvals/subject";
import type { ContentItem } from "@/lib/content/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The approval fingerprint.
 *
 * The rule under test: **if what would be published changes, the fingerprint
 * changes.** Approval attaches to a version of specific wording, and this hash
 * is how that claim stays checkable rather than merely asserted.
 */

const SUBJECT: ApprovalSubject = {
  contentItemId: "item-1",
  scriptureReference: "2 Peter 1:4",
  scriptureText:
    "Whereby are given unto us exceeding great and precious promises",
  scriptureTranslation: "KJV",
  scriptureVerificationStatus: "manually_verified",
  platform: "youtube",
  variantType: "youtube_short",
  title: "Precious promises",
  caption: "A word for today.",
  description: "Longer description.",
  hashtags: ["faith", "promises"],
  firstComment: "Amen.",
  cta: "Subscribe",
  thumbnailText: "PROMISES",
  videoProjectId: "video-1",
  videoProjectRevision: 4,
  mediaSelections: [
    { mediaAssetId: "asset-1", purpose: "primary", sortOrder: 0 },
    { mediaAssetId: "asset-2", purpose: "thumbnail", sortOrder: 1 },
  ],
};

function withChange(patch: Partial<ApprovalSubject>): ApprovalSubject {
  return { ...SUBJECT, ...patch };
}

describe("determinism", () => {
  it("returns the same hash for the same input, every time", () => {
    const first = approvalFingerprint(SUBJECT);
    const second = approvalFingerprint(SUBJECT);
    const third = approvalFingerprint({ ...SUBJECT });

    expect(first).toBe(second);
    expect(first).toBe(third);
  });

  it("is a 64-character hex digest, matching the database constraint", () => {
    expect(approvalFingerprint(SUBJECT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not depend on the order media rows came back in", () => {
    const reversed = withChange({
      mediaSelections: [...SUBJECT.mediaSelections].reverse(),
    });

    expect(approvalFingerprint(reversed)).toBe(approvalFingerprint(SUBJECT));
  });

  it("does not depend on the order of the object's own keys", () => {
    const rebuilt: ApprovalSubject = {
      mediaSelections: SUBJECT.mediaSelections,
      thumbnailText: SUBJECT.thumbnailText,
      cta: SUBJECT.cta,
      firstComment: SUBJECT.firstComment,
      hashtags: SUBJECT.hashtags,
      description: SUBJECT.description,
      caption: SUBJECT.caption,
      title: SUBJECT.title,
      variantType: SUBJECT.variantType,
      platform: SUBJECT.platform,
      scriptureVerificationStatus: SUBJECT.scriptureVerificationStatus,
      scriptureTranslation: SUBJECT.scriptureTranslation,
      scriptureText: SUBJECT.scriptureText,
      scriptureReference: SUBJECT.scriptureReference,
      contentItemId: SUBJECT.contentItemId,
      videoProjectId: SUBJECT.videoProjectId,
      videoProjectRevision: SUBJECT.videoProjectRevision,
    };

    expect(approvalFingerprint(rebuilt)).toBe(approvalFingerprint(SUBJECT));
  });
});

describe("publication-sensitive changes move the hash", () => {
  const cases: [string, Partial<ApprovalSubject>][] = [
    ["Scripture reference", { scriptureReference: "John 3:16" }],
    ["Scripture text", { scriptureText: "Different wording" }],
    ["Scripture translation", { scriptureTranslation: "NIV" }],
    ["verification status", { scriptureVerificationStatus: "unverified" }],
    ["platform", { platform: "tiktok" }],
    ["variant type", { variantType: "youtube_video" }],
    ["title", { title: "Something else" }],
    ["caption", { caption: "Rewritten." }],
    ["description", { description: "Rewritten." }],
    ["hashtags", { hashtags: ["faith"] }],
    ["hashtag order", { hashtags: ["promises", "faith"] }],
    ["first comment", { firstComment: "Different." }],
    ["CTA", { cta: "Follow" }],
    ["thumbnail text", { thumbnailText: "NEW" }],
    ["selected video", { videoProjectId: "video-2" }],
    ["video revision", { videoProjectRevision: 5 }],
    [
      "media selection",
      {
        mediaSelections: [
          { mediaAssetId: "asset-9", purpose: "primary", sortOrder: 0 },
        ],
      },
    ],
    [
      "media ordering",
      {
        mediaSelections: [
          { mediaAssetId: "asset-1", purpose: "primary", sortOrder: 5 },
          { mediaAssetId: "asset-2", purpose: "thumbnail", sortOrder: 1 },
        ],
      },
    ],
    ["content item", { contentItemId: "item-2" }],
  ];

  it.each(cases)("changes when the %s changes", (_label, patch) => {
    expect(approvalFingerprint(withChange(patch))).not.toBe(
      approvalFingerprint(SUBJECT),
    );
  });

  it("tells an absent value from an empty one", () => {
    // A caption that was deleted and one that was never written are different
    // states, and collapsing them would let one become the other unnoticed.
    const empty = approvalFingerprint(withChange({ caption: "" }));
    const absent = approvalFingerprint(withChange({ caption: null }));

    expect(empty).not.toBe(absent);
  });

  it("names the moved field in the canonical form", () => {
    // A hash is opaque when a test fails; the canonical string is not.
    const before = canonicaliseApprovalSubject(SUBJECT);
    const after = canonicaliseApprovalSubject(withChange({ cta: "Follow" }));

    expect(before).toContain("cta=s:Subscribe");
    expect(after).toContain("cta=s:Follow");
  });
});

describe("volatile values stay out", () => {
  it("lists what is deliberately excluded", () => {
    for (const field of [
      "created_at",
      "updated_at",
      "approved_at",
      "approved_by",
      "review_state",
      "id",
      "owner_id",
    ]) {
      expect([...EXCLUDED_FROM_FINGERPRINT]).toContain(field);
    }
  });

  it("has no excluded field anywhere in the canonical form", () => {
    const canonical = canonicaliseApprovalSubject(SUBJECT);

    for (const field of EXCLUDED_FROM_FINGERPRINT) {
      expect(canonical, `${field} must not be fingerprinted`).not.toContain(
        `${field}=`,
      );
    }
  });
});

describe("fingerprintMatches", () => {
  it("matches a hash taken over the same content", () => {
    expect(fingerprintMatches(approvalFingerprint(SUBJECT), SUBJECT)).toBe(
      true,
    );
  });

  it("refuses a hash taken before an edit", () => {
    const stored = approvalFingerprint(SUBJECT);

    expect(fingerprintMatches(stored, withChange({ caption: "Edited." }))).toBe(
      false,
    );
  });

  it("treats a missing hash as a non-match, not as a pass", () => {
    // "Unknown" must never resolve to "fine": that is how stale content
    // reaches an audience.
    expect(fingerprintMatches(null, SUBJECT)).toBe(false);
    expect(fingerprintMatches("", SUBJECT)).toBe(false);
  });
});

describe("approvalSubjectFrom", () => {
  const variant = {
    content_item_id: "item-1",
    platform: "youtube",
    variant_type: "youtube_short",
    title: "T",
    caption: "C",
    description: null,
    hashtags: ["a"],
    first_comment: null,
    cta: null,
    thumbnail_text: null,
  } as unknown as PlatformVariant;

  const item = {
    scripture_reference: "2 Peter 1:4",
    scripture_text: "…",
    scripture_translation: "KJV",
    scripture_verification_status: "manually_verified",
  } as unknown as ContentItem;

  it("builds a subject entirely from stored records", () => {
    const subject = approvalSubjectFrom(
      variant,
      item,
      { id: "video-1", current_revision: 2 },
      [],
    );

    expect(subject.contentItemId).toBe("item-1");
    expect(subject.videoProjectRevision).toBe(2);
    expect(subject.scriptureReference).toBe("2 Peter 1:4");
  });

  it("records the absence of a video rather than a placeholder", () => {
    const subject = approvalSubjectFrom(variant, item, null, []);

    expect(subject.videoProjectId).toBeNull();
    expect(subject.videoProjectRevision).toBeNull();
  });

  it("distinguishes having a video from not having one", () => {
    const without = approvalFingerprint(
      approvalSubjectFrom(variant, item, null, []),
    );
    const with1 = approvalFingerprint(
      approvalSubjectFrom(variant, item, { id: "v", current_revision: 1 }, []),
    );

    expect(without).not.toBe(with1);
  });
});
