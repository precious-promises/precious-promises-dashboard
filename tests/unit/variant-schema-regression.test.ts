// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseVariantForm, variantValuesFrom } from "@/lib/variants/schema";

/**
 * A regression test for optional fields read from a `FormData`.
 *
 * The bug: `FormData.get` returns **`null`** for a field that was not
 * submitted at all. The old preprocess only mapped `""` to `undefined`, so
 * `null` reached `z.string().optional()` — which rejects it, because `null` is
 * not `undefined`. A form that legitimately omitted an optional field failed
 * validation, and the message talked about the wrong type rather than the
 * missing field.
 *
 * This matters beyond tidiness: the Caption Studio form renders every field,
 * so the bug was invisible there. Any *other* caller submitting a partial form
 * — a future quick-edit, a narrower form, a programmatic save — would have hit
 * it, and the error would have made no sense.
 */

const REQUIRED = {
  platform: "youtube",
  variant_type: "youtube_short",
  hashtags: [],
  review_state: "draft",
};

describe("optional text fields accept every form of absence", () => {
  it("accepts null, which is what an omitted FormData field gives", () => {
    const result = parseVariantForm({
      ...REQUIRED,
      title: null,
      caption: null,
      description: null,
      first_comment: null,
      cta: null,
      thumbnail_text: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
      expect(result.data.caption).toBeUndefined();
    }
  });

  it("accepts undefined, which is what an absent key gives", () => {
    const result = parseVariantForm({ ...REQUIRED });

    expect(result.success).toBe(true);
  });

  it("accepts the empty string, which is a field submitted blank", () => {
    const result = parseVariantForm({
      ...REQUIRED,
      title: "",
      caption: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
    }
  });

  it("accepts whitespace only, which is blank in every way that matters", () => {
    const result = parseVariantForm({ ...REQUIRED, title: "   \n\t " });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeUndefined();
    }
  });

  it("parses a genuinely partial FormData end to end", () => {
    // The real shape of the bug: a form that renders only some fields.
    const form = new FormData();
    form.set("platform", "youtube");
    form.set("variant_type", "youtube_short");
    form.set("title", "Precious promises");

    const result = parseVariantForm(variantValuesFrom(form));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Precious promises");
      expect(result.data.caption).toBeUndefined();
      expect(result.data.cta).toBeUndefined();
    }
  });
});

describe("the fix changed nothing else", () => {
  it("still trims a real value", () => {
    const result = parseVariantForm({
      ...REQUIRED,
      title: "  Precious promises  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Precious promises");
    }
  });

  it("still enforces the maximum length", () => {
    const result = parseVariantForm({ ...REQUIRED, title: "x".repeat(301) });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.title).toBeDefined();
    }
  });

  it("still refuses a missing required field", () => {
    // Absence is only forgiven where the field is genuinely optional.
    const result = parseVariantForm({ hashtags: [], review_state: "draft" });

    expect(result.success).toBe(false);
  });

  it("still refuses a mismatched platform and variant type", () => {
    const result = parseVariantForm({
      ...REQUIRED,
      variant_type: "tiktok_video",
    });

    expect(result.success).toBe(false);
  });
});
