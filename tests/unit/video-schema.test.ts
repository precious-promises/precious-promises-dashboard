import { describe, expect, it } from "vitest";

import {
  parseProductionAssetForm,
  parseProjectForm,
  parseSceneForm,
  productionAssetValuesFrom,
  projectValuesFrom,
  sceneObjectSchema,
  sceneValuesFrom,
} from "@/lib/video/schema";
import { MAX_SCENE_SECONDS, MIN_SCENE_SECONDS } from "@/lib/video/scenes";
import { ASPECT_RATIOS, sceneTextSourceFor } from "@/lib/video/types";

/**
 * Video project and scene validation.
 *
 * The rules with real consequences are the Scripture ones: a Scripture scene
 * must reference the verified verse, and nothing else may read from it. Both
 * are asserted here and enforced again by check constraints on `video_scenes`.
 */

const VALID_SCENE = {
  scene_type: "explanation",
  text_source: "custom",
  text_content: "In your own words.",
  duration_seconds: 5,
};

describe("project schema", () => {
  it("accepts a complete project", () => {
    const result = parseProjectForm({
      name: "Precious Promises — 2 Peter 1:4",
      content_item_id: "8a1f0f60-0000-4000-8000-000000000000",
      aspect_ratio: "9:16",
      status: "draft",
    });

    expect(result.success).toBe(true);
  });

  it.each(ASPECT_RATIOS)("accepts the %s format", (ratio) => {
    const result = parseProjectForm({
      name: "A project",
      content_item_id: "item-1",
      aspect_ratio: ratio,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a format the product does not publish in", () => {
    const result = parseProjectForm({
      name: "A project",
      content_item_id: "item-1",
      aspect_ratio: "4:3",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.aspect_ratio).toBeDefined();
    }
  });

  it("requires a name and a content item", () => {
    const result = parseProjectForm({ name: "  ", aspect_ratio: "16:9" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.name).toBeDefined();
      expect(result.fieldErrors.content_item_id).toBeDefined();
    }
  });

  it("defines no owner_id, so one cannot be submitted", () => {
    // Ownership is read from the session in the server action. A field that
    // does not exist in the schema is stripped before the insert.
    const formData = new FormData();
    formData.set("name", "A project");
    formData.set("content_item_id", "item-1");
    formData.set("aspect_ratio", "1:1");
    formData.set("owner_id", "someone-else");

    const values = projectValuesFrom(formData) as object;

    expect(Object.keys(values)).not.toContain("owner_id");
    expect(parseProjectForm(values).success).toBe(true);
  });
});

describe("scene schema", () => {
  it("accepts a written scene", () => {
    expect(parseSceneForm(VALID_SCENE).success).toBe(true);
  });

  it("refuses text on a Scripture scene", () => {
    // The rule that matters most in this file: a verse cannot be typed.
    const result = parseSceneForm({
      scene_type: "scripture",
      text_source: "content_scripture",
      text_content: "For God so loved the world…",
      duration_seconds: 6,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.text_content).toMatch(
        /cannot be written here/i,
      );
    }
  });

  it("refuses a Scripture scene that does not reference the verified verse", () => {
    const result = parseSceneForm({
      scene_type: "scripture",
      text_source: "custom",
      duration_seconds: 6,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.text_source).toBeDefined();
    }
  });

  it("refuses prose scenes that try to read the Scripture record", () => {
    for (const sceneType of ["declaration", "prayer", "explanation", "outro"]) {
      const result = parseSceneForm({
        scene_type: sceneType,
        text_source: "content_scripture",
        duration_seconds: 4,
      });

      expect(result.success, `${sceneType} must not read Scripture`).toBe(
        false,
      );
    }
  });

  it("does not store text twice when it is read from the script", () => {
    const result = parseSceneForm({
      scene_type: "declaration",
      text_source: "script_revision",
      text_content: "A copy that would drift.",
      duration_seconds: 4,
    });

    expect(result.success).toBe(false);
  });

  it("accepts a scene that reads the saved script", () => {
    const result = parseSceneForm({
      scene_type: "prayer",
      text_source: "script_revision",
      duration_seconds: 8,
    });

    expect(result.success).toBe(true);
  });

  it("defines neither owner_id nor project_id", () => {
    const fields = Object.keys(sceneObjectSchema.shape);

    expect(fields).not.toContain("owner_id");
    expect(fields).not.toContain("project_id");
  });

  it("carries no Scripture field of any kind", () => {
    const fields = Object.keys(sceneObjectSchema.shape);

    for (const field of fields) {
      expect(field).not.toMatch(/scripture|verse|reference|translation/i);
    }
  });
});

describe("scene duration validation", () => {
  it("rejects a duration below the minimum", () => {
    const result = parseSceneForm({
      ...VALID_SCENE,
      duration_seconds: MIN_SCENE_SECONDS - 0.1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.duration_seconds).toBeDefined();
    }
  });

  it("rejects a duration above the maximum", () => {
    const result = parseSceneForm({
      ...VALID_SCENE,
      duration_seconds: MAX_SCENE_SECONDS + 1,
    });

    expect(result.success).toBe(false);
  });

  it("accepts the boundaries themselves", () => {
    expect(
      parseSceneForm({ ...VALID_SCENE, duration_seconds: MIN_SCENE_SECONDS })
        .success,
    ).toBe(true);
    expect(
      parseSceneForm({ ...VALID_SCENE, duration_seconds: MAX_SCENE_SECONDS })
        .success,
    ).toBe(true);
  });

  it("reads a duration typed into a form as a number", () => {
    const formData = new FormData();
    formData.set("scene_type", "outro");
    formData.set("text_source", "custom");
    formData.set("text_content", "Thanks for watching.");
    formData.set("duration_seconds", "3.5");

    const result = parseSceneForm(sceneValuesFrom(formData));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.duration_seconds).toBe(3.5);
    }
  });

  it("rejects a duration that is not a number", () => {
    const formData = new FormData();
    formData.set("scene_type", "outro");
    formData.set("duration_seconds", "soon");

    expect(parseSceneForm(sceneValuesFrom(formData)).success).toBe(false);
  });
});

describe("sceneTextSourceFor", () => {
  it("forces a Scripture scene onto the verified record", () => {
    expect(sceneTextSourceFor("scripture", "custom")).toBe("content_scripture");
    expect(sceneTextSourceFor("scripture", "script_revision")).toBe(
      "content_scripture",
    );
  });

  it("refuses to let prose read the Scripture record", () => {
    expect(sceneTextSourceFor("declaration", "content_scripture")).toBe(
      "custom",
    );
    expect(sceneTextSourceFor("prayer", "content_scripture")).toBe("custom");
  });

  it("leaves a legal prose source alone", () => {
    expect(sceneTextSourceFor("explanation", "script_revision")).toBe(
      "script_revision",
    );
  });
});

describe("production asset slots", () => {
  it("accepts an asset in a slot", () => {
    const result = parseProductionAssetForm({
      role: "background_audio",
      media_asset_id: "asset-1",
      starts_at_seconds: 0,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a slot the product does not have", () => {
    const result = parseProductionAssetForm({
      role: "green_screen",
      media_asset_id: "asset-1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a negative start time", () => {
    const result = parseProductionAssetForm({
      role: "voiceover",
      media_asset_id: "asset-1",
      starts_at_seconds: -1,
    });

    expect(result.success).toBe(false);
  });

  it("reads a slot out of FormData without an owner", () => {
    const formData = new FormData();
    formData.set("role", "logo");
    formData.set("media_asset_id", "asset-9");
    formData.set("owner_id", "someone-else");

    const values = productionAssetValuesFrom(formData) as object;

    expect(Object.keys(values)).not.toContain("owner_id");
    expect(parseProductionAssetForm(values).success).toBe(true);
  });
});
