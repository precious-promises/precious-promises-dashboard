// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  contentFormValuesFrom,
  parseContentForm,
  parseContentUpdate,
} from "@/lib/content/schema";
import { DEFAULT_SCRIPTURE_TRANSLATION } from "@/lib/content/types";

const VALID = {
  title: "Promises of Peace",
  content_type: "youtube_short",
  topic: "Peace",
  scripture_reference: "2 Peter 1:4",
  scripture_text:
    "Whereby are given unto us exceeding great and precious promises...",
  scripture_translation: "KJV",
  description: "A declaration to close the video.",
};

describe("parseContentForm", () => {
  it("accepts a complete submission", () => {
    const result = parseContentForm(VALID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Promises of Peace");
      expect(result.data.content_type).toBe("youtube_short");
    }
  });

  it("requires a title", () => {
    const result = parseContentForm({ ...VALID, title: "   " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.title).toBe("Enter a title");
    }
  });

  it("requires a known content type", () => {
    const result = parseContentForm({ ...VALID, content_type: "podcast" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.content_type).toBeDefined();
    }
  });

  it("defaults the translation to KJV", () => {
    const result = parseContentForm({
      title: "Untitled",
      content_type: "tiktok_video",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scripture_translation).toBe(
        DEFAULT_SCRIPTURE_TRANSLATION,
      );
    }
  });

  it("treats blank optional fields as absent", () => {
    const result = parseContentForm({
      title: "Untitled",
      content_type: "tiktok_video",
      topic: "",
      scripture_reference: "   ",
      description: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topic).toBeUndefined();
      expect(result.data.scripture_reference).toBeUndefined();
    }
  });

  it("preserves Scripture text exactly as entered", () => {
    // The application must never reformat, complete or correct a verse.
    const text = "  Whereby are given   unto us exceeding great promises...  ";
    const result = parseContentForm({ ...VALID, scripture_text: text });

    expect(result.success).toBe(true);
    if (result.success) {
      // Only surrounding whitespace is trimmed; interior wording is untouched.
      expect(result.data.scripture_text).toBe(text.trim());
    }
  });

  it("rejects an over-long title rather than truncating it", () => {
    const result = parseContentForm({ ...VALID, title: "x".repeat(201) });

    expect(result.success).toBe(false);
  });
});

describe("owner_id can never come from a submission", () => {
  it("is stripped from a create payload", () => {
    const result = parseContentForm({
      ...VALID,
      owner_id: "99999999-9999-9999-9999-999999999999",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("owner_id");
      expect(Object.keys(result.data)).not.toContain("owner_id");
    }
  });

  it("is stripped from an update payload", () => {
    const result = parseContentUpdate({
      ...VALID,
      status: "draft",
      owner_id: "99999999-9999-9999-9999-999999999999",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("owner_id");
    }
  });

  it("is not read out of FormData", () => {
    const formData = new FormData();
    formData.set("title", "Attempt");
    formData.set("content_type", "youtube_short");
    formData.set("owner_id", "99999999-9999-9999-9999-999999999999");

    const values = contentFormValuesFrom(formData) as Record<string, unknown>;

    expect(values).not.toHaveProperty("owner_id");
  });

  it("does not let a submission set verification state", () => {
    // Verification is a decision, not an input.
    const result = parseContentForm({
      ...VALID,
      scripture_verification_status: "manually_verified",
      scripture_verified_at: "2026-01-01T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("scripture_verification_status");
      expect(result.data).not.toHaveProperty("scripture_verified_at");
    }
  });

  it("does not let a create submission choose its own status", () => {
    const result = parseContentForm({ ...VALID, status: "archived" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("status");
    }
  });
});

describe("parseContentUpdate", () => {
  it("accepts a known status", () => {
    const result = parseContentUpdate({ ...VALID, status: "ready_for_review" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("ready_for_review");
    }
  });

  it("rejects a status the system cannot honour", () => {
    // 'published' has no machinery behind it, so it must not be settable.
    const result = parseContentUpdate({ ...VALID, status: "published" });

    expect(result.success).toBe(false);
  });
});

describe("contentFormValuesFrom", () => {
  it("defaults the translation when the field is absent", () => {
    const formData = new FormData();
    formData.set("title", "Untitled");
    formData.set("content_type", "youtube_short");

    const values = contentFormValuesFrom(formData) as Record<string, unknown>;

    expect(values.scripture_translation).toBe(DEFAULT_SCRIPTURE_TRANSLATION);
  });
});
