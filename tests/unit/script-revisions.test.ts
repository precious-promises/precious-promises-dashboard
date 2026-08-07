// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  parseScriptRevision,
  scriptValuesFrom,
  scriptRevisionSchema,
} from "@/lib/scripts/schema";
import {
  isEmptyRevision,
  nextRevisionNumber,
  SCRIPT_SECTIONS,
  SPOKEN_SECTIONS,
} from "@/lib/scripts/types";

describe("nextRevisionNumber", () => {
  it("starts at 1 when there is no script", () => {
    expect(nextRevisionNumber(null)).toBe(1);
  });

  it("increments from the latest revision", () => {
    expect(nextRevisionNumber(1)).toBe(2);
    expect(nextRevisionNumber(3)).toBe(4);
    expect(nextRevisionNumber(41)).toBe(42);
  });

  it("never reuses or goes backwards on nonsense input", () => {
    // A reused number would overwrite history via the unique constraint.
    expect(nextRevisionNumber(0)).toBe(1);
    expect(nextRevisionNumber(-5)).toBe(1);
    expect(nextRevisionNumber(Number.NaN)).toBe(1);
  });
});

describe("isEmptyRevision", () => {
  it("is true when every section is blank", () => {
    expect(isEmptyRevision({})).toBe(true);
    expect(isEmptyRevision({ hook: "   ", prayer: "" })).toBe(true);
  });

  it("is false when any section has content", () => {
    expect(isEmptyRevision({ declaration: "I am kept in peace." })).toBe(false);
  });
});

describe("parseScriptRevision", () => {
  it("accepts the written sections", () => {
    const result = parseScriptRevision({
      hook: "Three promises for a hard week.",
      explanation: "Here is what this means.",
      declaration: "I walk in peace.",
      prayer: "Father, thank you.",
      outro: "Subscribe for more.",
      notes: "Record on Tuesday.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.declaration).toBe("I walk in peace.");
    }
  });

  it("allows a revision with only some sections filled", () => {
    const result = parseScriptRevision({ hook: "Just the hook for now." });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prayer).toBeUndefined();
    }
  });

  it("rejects prose beyond the column limit rather than truncating", () => {
    const result = parseScriptRevision({ hook: "x".repeat(5001) });

    expect(result.success).toBe(false);
  });
});

describe("a script can never carry Scripture", () => {
  const SCRIPTURE_FIELDS = [
    "scripture_text",
    "scripture_reference",
    "scripture_translation",
    "scripture_verification_status",
  ];

  it("defines no Scripture field in its schema", () => {
    // Structural guarantee: the Script Studio cannot alter a verse because it
    // has nowhere to put one.
    const shape = Object.keys(scriptRevisionSchema.shape);

    for (const field of SCRIPTURE_FIELDS) {
      expect(shape).not.toContain(field);
    }
    expect(shape.sort()).toEqual([...SCRIPT_SECTIONS].sort());
  });

  it("strips Scripture fields from a submission", () => {
    const result = parseScriptRevision({
      hook: "A hook",
      scripture_text: "Injected verse text",
      scripture_reference: "Injected 1:1",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("scripture_text");
      expect(result.data).not.toHaveProperty("scripture_reference");
      expect(JSON.stringify(result.data)).not.toContain("Injected");
    }
  });

  it("does not read Scripture or ownership out of FormData", () => {
    const formData = new FormData();
    formData.set("hook", "A hook");
    formData.set("scripture_text", "Injected verse text");
    formData.set("owner_id", "99999999-9999-9999-9999-999999999999");
    formData.set("revision_number", "99");

    const values = scriptValuesFrom(formData) as Record<string, unknown>;

    expect(values).not.toHaveProperty("scripture_text");
    expect(values).not.toHaveProperty("owner_id");
    expect(values).not.toHaveProperty("revision_number");
    expect(Object.keys(values).sort()).toEqual([...SCRIPT_SECTIONS].sort());
  });
});

describe("declaration and prayer stay separate from Scripture", () => {
  it("keeps them as distinct fields from one another", () => {
    const result = parseScriptRevision({
      declaration: "I am healed.",
      prayer: "Father, thank you for healing.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.declaration).toBe("I am healed.");
      expect(result.data.prayer).toBe("Father, thank you for healing.");
      expect(result.data.declaration).not.toBe(result.data.prayer);
    }
  });

  it("counts notes as private, outside the spoken piece", () => {
    expect(SPOKEN_SECTIONS).not.toContain("notes");
    expect(SPOKEN_SECTIONS).toContain("declaration");
    expect(SPOKEN_SECTIONS).toContain("prayer");
  });
});
