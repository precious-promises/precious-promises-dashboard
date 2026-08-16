// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { effectiveSettings } from "@/lib/settings/repository";
import { SETTINGS_DEFAULTS, type AppSettings } from "@/lib/settings/types";

/**
 * Settings: preferences only, and a readiness board that may say Configured
 * or Not configured and nothing else. No secret value reaches the browser,
 * in any state, on any path.
 */

describe("effective settings", () => {
  it("falls back to the defaults when nothing is stored", () => {
    expect(effectiveSettings(null)).toEqual(SETTINGS_DEFAULTS);
  });

  it("uses stored values when they are valid", () => {
    const stored: AppSettings = {
      id: "s1",
      owner_id: "owner",
      timezone: "Africa/Lagos",
      default_aspect_ratio: "16:9",
      default_cta: "Subscribe",
      brand_line: "Precious Promises",
      elevenlabs_voice_id: "voice-1",
      elevenlabs_model_id: "eleven_multilingual_v2",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };

    const effective = effectiveSettings(stored);
    expect(effective.timezone).toBe("Africa/Lagos");
    expect(effective.default_aspect_ratio).toBe("16:9");
    expect(effective.elevenlabs_voice_id).toBe("voice-1");
  });

  it("replaces an invalid stored timezone with the default", () => {
    const stored = {
      id: "s1",
      owner_id: "owner",
      timezone: "Not/AZone",
      default_aspect_ratio: "9:16",
      default_cta: null,
      brand_line: null,
      elevenlabs_voice_id: null,
      elevenlabs_model_id: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    } as AppSettings;

    expect(effectiveSettings(stored).timezone).toBe(SETTINGS_DEFAULTS.timezone);
  });
});

describe("no credential can pass through the settings surface", () => {
  const FILES = [
    "src/lib/settings/types.ts",
    "src/lib/settings/repository.ts",
    "src/app/dashboard/settings/actions.ts",
    "src/app/dashboard/settings/page.tsx",
    "src/components/settings/settings-form.tsx",
  ];

  it("has no field that could hold a secret", () => {
    const types = readFileSync(
      join(process.cwd(), "src/lib/settings/types.ts"),
      "utf8",
    );
    for (const word of ["api_key", "apiKey", "token", "secret", "password"]) {
      expect(types, word).not.toContain(word);
    }
  });

  it("never reads a server credential in the write path", () => {
    const actions = readFileSync(
      join(process.cwd(), "src/app/dashboard/settings/actions.ts"),
      "utf8",
    );
    for (const variable of [
      "ELEVENLABS_API_KEY",
      "AI_API_KEY",
      "SUPABASE_SECRET_KEY",
      "TOKEN_ENCRYPTION_KEY",
      "getServerEnv",
    ]) {
      expect(actions, variable).not.toContain(variable);
    }
  });

  it("reports readiness only through is*Configured booleans", () => {
    const page = readFileSync(
      join(process.cwd(), "src/app/dashboard/settings/page.tsx"),
      "utf8",
    );
    // The page derives Configured/Not configured from booleans; it never
    // touches env values directly and never interpolates one into markup.
    expect(page).not.toContain("process.env");
    expect(page).not.toContain("getServerEnv");
    expect(page).toMatch(/isAiConfigured/);
    expect(page).toMatch(/isElevenLabsConfigured/);
    expect(page).toMatch(/isRenderConfigured/);
    expect(page).toMatch(/isWorkerConfigured/);
  });

  it("passes no secret-shaped prop into the client form", () => {
    const form = readFileSync(
      join(process.cwd(), "src/components/settings/settings-form.tsx"),
      "utf8",
    );
    for (const word of ["apiKey", "api_key", "secret", "token"]) {
      expect(form, word).not.toContain(word);
    }
  });

  it("keeps every settings file free of literal credential values", () => {
    for (const file of FILES) {
      const contents = readFileSync(join(process.cwd(), file), "utf8");
      expect(contents, file).not.toMatch(/sb_secret_[a-zA-Z0-9]/);
      expect(contents, file).not.toMatch(/sk-[a-zA-Z0-9]{20}/);
    }
  });
});
