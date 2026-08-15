// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvCache } from "@/lib/env/server";
import { getAiProvider } from "@/lib/ai/provider";
import {
  AI_SYSTEM_PROMPT,
  buildPrompt,
  PROMPT_TEMPLATE_VERSION,
} from "@/lib/ai/prompts";
import {
  isAiConfigured,
  resolveAiConfig,
  SUPPORTED_AI_PROVIDER,
} from "@/lib/ai/server-config";
import {
  AI_GENERATION_TYPES,
  jsonSchemaFor,
  validateAiOutput,
  type AiDraftRequest,
} from "@/lib/ai/types";

/**
 * AI safety: structural, not aspirational.
 *
 * The rules — AI drafts only, AI never touches Scripture, AI never approves,
 * schedules or publishes — are enforced by closed schemas, separated context
 * and the absence of any code path, and these tests pin each mechanism.
 */

// getServerEnv validates the whole environment; APP_URL is required.
process.env.APP_URL ||= "http://localhost:3000";

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("when no AI credential is configured", () => {
  it("resolves to null with reasons, never throwing", () => {
    resetServerEnvCache();
    const { config, problems } = resolveAiConfig();
    expect(config).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
    expect(isAiConfigured()).toBe(false);
  });

  it("returns no provider", () => {
    const { provider, problems } = getAiProvider();
    expect(provider).toBeNull();
    expect(problems.length).toBeGreaterThan(0);
  });

  it("supports exactly one provider id", () => {
    expect(SUPPORTED_AI_PROVIDER).toBe("anthropic");
  });
});

describe("every output schema is closed against Scripture", () => {
  it("rejects a scripture field on every generation type", () => {
    for (const type of AI_GENERATION_TYPES) {
      const smuggled = {
        scripture: "For God so loved…",
        verse_text: "…",
        scripture_reference: "John 3:16",
      };
      expect(validateAiOutput(type, smuggled), type).toBeNull();
    }
  });

  it("rejects any unexpected key alongside valid fields", () => {
    const valid = validateAiOutput("title", { title: "A good title" });
    expect(valid).toEqual({ title: "A good title" });

    expect(
      validateAiOutput("title", {
        title: "A good title",
        scripture: "smuggled",
      }),
    ).toBeNull();
    expect(
      validateAiOutput("prayer", { prayer: "…", verse: "smuggled" }),
    ).toBeNull();
  });

  it("declares additionalProperties false in every server-side schema", () => {
    for (const type of AI_GENERATION_TYPES) {
      const schema = jsonSchemaFor(type);
      expect(schema.additionalProperties, type).toBe(false);
      const properties = schema.properties as Record<string, unknown>;
      for (const key of Object.keys(properties)) {
        expect(key.toLowerCase(), type).not.toContain("scripture");
        expect(key.toLowerCase(), type).not.toContain("verse");
      }
    }
  });

  it("rejects non-object output entirely", () => {
    expect(validateAiOutput("caption", "just a string")).toBeNull();
    expect(validateAiOutput("caption", null)).toBeNull();
    expect(validateAiOutput("caption", [1, 2])).toBeNull();
  });
});

describe("the prompt keeps Scripture as separated, read-only context", () => {
  const request: AiDraftRequest = {
    type: "script_draft",
    instruction: "Keep it gentle.",
    scripture: {
      reference: "2 Peter 1:4",
      text: "Whereby are given unto us exceeding great and precious promises…",
      translation: "KJV",
    },
    workingMaterial: "TOPIC: God's promises",
    platform: null,
  };

  it("marks the Scripture block read-only and separate from the instruction", () => {
    const prompt = buildPrompt(request);
    const scriptureIndex = prompt.indexOf("VERIFIED SCRIPTURE");
    const instructionIndex = prompt.indexOf("THE OWNER'S REQUEST");

    expect(scriptureIndex).toBeGreaterThanOrEqual(0);
    expect(prompt).toMatch(/read-only input/i);
    expect(instructionIndex).toBeGreaterThan(scriptureIndex);
  });

  it("states the immutability and no-guarantees rules in the system prompt", () => {
    expect(AI_SYSTEM_PROMPT).toMatch(/READ-ONLY/);
    expect(AI_SYSTEM_PROMPT).toMatch(/[Nn]ever alter/);
    expect(AI_SYSTEM_PROMPT).toMatch(/[Nn]ever promise guaranteed outcomes/);
    expect(AI_SYSTEM_PROMPT).toMatch(/no guaranteed healing, wealth/i);
  });

  it("says plainly when no Scripture is attached rather than inventing any", () => {
    const prompt = buildPrompt({ ...request, scripture: null });
    expect(prompt).toMatch(/No Scripture passage is attached/);
    expect(prompt).not.toContain("2 Peter");
  });

  it("versions the template for provenance", () => {
    expect(PROMPT_TEMPLATE_VERSION).toMatch(/^stage11-/);
  });
});

describe("AI can only draft — the code paths that would act do not exist", () => {
  const AI_SOURCES = [
    "src/lib/ai/types.ts",
    "src/lib/ai/prompts.ts",
    "src/lib/ai/server-config.ts",
    "src/lib/ai/anthropic-provider.ts",
    "src/lib/ai/provider.ts",
    "src/lib/ai/generations.ts",
  ];

  it("never touches approval, scheduling or publishing tables", () => {
    for (const file of AI_SOURCES) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      for (const table of [
        "content_approvals",
        "scheduled_posts",
        "publish_attempts",
        "recurring_schedule_rules",
      ]) {
        expect(contents, `${file} references ${table}`).not.toContain(table);
      }
    }
  });

  it("never writes scripture verification state", () => {
    for (const file of AI_SOURCES) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      expect(contents, file).not.toContain("scripture_verification_status");
      expect(contents, file).not.toContain("manually_verified");
    }
  });

  it("routes acceptance through the studio's own machinery", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/dashboard/ai/actions.ts"),
      "utf8",
    );

    // A new revision via the same INSERT path, and variant edits through the
    // same approval invalidation a hand edit runs.
    expect(actions).toMatch(/nextRevisionNumberFor/);
    expect(actions).toMatch(/syncApprovalsForItem/);
    // And no path from a draft to a publish state.
    expect(actions).not.toMatch(/status:\s*["']posted["']/);
    expect(actions).not.toContain("scheduled_posts");
  });

  it("keeps the generation decision vocabulary human-shaped", () => {
    const generations = readFileSync(
      join(process.cwd(), "src/lib/ai/generations.ts"),
      "utf8",
    );
    // drafted → accepted | rejected. There is no "auto" anything.
    expect(generations).not.toMatch(/auto[_-]?accept/i);
    expect(generations).not.toMatch(/auto[_-]?approve/i);
  });

  it("records provenance in the database constraint", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260815090000_create_production_automation.sql",
      ),
      "utf8",
    );
    expect(migration).toMatch(/ai_generations/);
    expect(migration).toMatch(/prompt_template_version/);
    expect(migration).toMatch(/accepted[\s\S]*?requires[\s\S]*?target/i);
  });
});
