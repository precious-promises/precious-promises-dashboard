// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  parseHashtagInput,
  parseVariantForm,
  variantObjectSchema,
  variantValuesFrom,
} from "@/lib/variants/schema";
import {
  canMarkReadyForReview,
  isVariantTypeForPlatform,
  PLATFORM_VARIANT_TYPES,
  REVIEW_STATES,
  VARIANT_PLATFORMS,
} from "@/lib/variants/types";

const VALID = {
  platform: "youtube",
  variant_type: "youtube_short",
  title: "Three precious promises",
  caption: "A short encouragement.",
  description: "Longer description.",
  hashtags: ["peace", "promises"],
  first_comment: "Which promise met you today?",
  cta: "Subscribe for daily promises",
  thumbnail_text: "PROMISES",
  review_state: "draft",
};

describe("parseVariantForm", () => {
  it("accepts a complete variant", () => {
    const result = parseVariantForm(VALID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.platform).toBe("youtube");
      expect(result.data.hashtags).toEqual(["peace", "promises"]);
    }
  });

  it("defaults review state to draft", () => {
    const result = parseVariantForm({
      platform: "tiktok",
      variant_type: "tiktok_video",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.review_state).toBe("draft");
    }
  });

  it("rejects a variant type that belongs to another platform", () => {
    // An instagram_reel filed under youtube would eventually be published to
    // the wrong place.
    const result = parseVariantForm({
      ...VALID,
      platform: "youtube",
      variant_type: "instagram_reel",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.variant_type).toMatch(/does not belong/i);
    }
  });

  it("rejects an unknown platform", () => {
    const result = parseVariantForm({ ...VALID, platform: "threads" });

    expect(result.success).toBe(false);
  });

  it("rejects a review state the system cannot honour", () => {
    // approved/rejected belong to the approval stage, which does not exist.
    for (const state of ["approved", "rejected", "published"]) {
      expect(parseVariantForm({ ...VALID, review_state: state }).success).toBe(
        false,
      );
    }
  });

  it("only offers draft and ready_for_review", () => {
    expect([...REVIEW_STATES]).toEqual(["draft", "ready_for_review"]);
  });
});

describe("a variant can never carry Scripture", () => {
  it("defines no Scripture field", () => {
    const shape = Object.keys(variantObjectSchema.shape);

    for (const field of ["scripture_text", "scripture_reference"]) {
      expect(shape).not.toContain(field);
    }
  });

  it("strips Scripture and ownership from a submission", () => {
    const result = parseVariantForm({
      ...VALID,
      scripture_text: "Injected verse",
      owner_id: "99999999-9999-9999-9999-999999999999",
      content_item_id: "88888888-8888-8888-8888-888888888888",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("scripture_text");
      expect(result.data).not.toHaveProperty("owner_id");
      expect(result.data).not.toHaveProperty("content_item_id");
      expect(JSON.stringify(result.data)).not.toContain("Injected");
    }
  });

  it("does not read Scripture or ownership out of FormData", () => {
    const formData = new FormData();
    formData.set("platform", "youtube");
    formData.set("variant_type", "youtube_short");
    formData.set("scripture_text", "Injected verse");
    formData.set("owner_id", "99999999-9999-9999-9999-999999999999");

    const values = variantValuesFrom(formData) as Record<string, unknown>;

    expect(values).not.toHaveProperty("scripture_text");
    expect(values).not.toHaveProperty("owner_id");
  });
});

describe("isVariantTypeForPlatform", () => {
  it("pairs each type with exactly one platform", () => {
    for (const platform of VARIANT_PLATFORMS) {
      for (const type of PLATFORM_VARIANT_TYPES[platform]) {
        expect(isVariantTypeForPlatform(platform, type)).toBe(true);

        for (const other of VARIANT_PLATFORMS) {
          if (other !== platform) {
            expect(isVariantTypeForPlatform(other, type)).toBe(false);
          }
        }
      }
    }
  });
});

describe("canMarkReadyForReview", () => {
  it("allows a variant with any written content", () => {
    expect(canMarkReadyForReview({ title: "A title" })).toBe(true);
    expect(canMarkReadyForReview({ caption: "A caption" })).toBe(true);
    expect(canMarkReadyForReview({ description: "A description" })).toBe(true);
  });

  it("refuses an empty variant", () => {
    // Putting a placeholder in front of a human as though it were work.
    expect(canMarkReadyForReview({})).toBe(false);
    expect(
      canMarkReadyForReview({ title: "  ", caption: null, description: null }),
    ).toBe(false);
  });

  it("accepts both null and undefined as empty", () => {
    expect(canMarkReadyForReview({ title: null, caption: undefined })).toBe(
      false,
    );
  });
});

describe("parseHashtagInput", () => {
  it("splits on spaces and commas", () => {
    expect(parseHashtagInput("peace, promises hope")).toEqual([
      "peace",
      "promises",
      "hope",
    ]);
  });

  it("strips a leading hash", () => {
    expect(parseHashtagInput("#peace ##promises")).toEqual([
      "peace",
      "promises",
    ]);
  });

  it("removes duplicates case-insensitively, keeping the first spelling", () => {
    expect(parseHashtagInput("Peace peace PEACE")).toEqual(["Peace"]);
  });

  it("returns an empty list for empty or non-string input", () => {
    expect(parseHashtagInput("")).toEqual([]);
    expect(parseHashtagInput("   ")).toEqual([]);
    expect(parseHashtagInput(null)).toEqual([]);
    expect(parseHashtagInput(42)).toEqual([]);
  });
});
