// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetServerEnvCache } from "@/lib/env/server";
import {
  DEFAULT_VOICE_MODEL,
  ELEVENLABS_API_BASE,
  ELEVENLABS_AUTH_HEADER,
  textToSpeechUrl,
  VOICE_MODELS,
  VOICE_OUTPUT_FORMAT,
} from "@/lib/voice/config";
import {
  classifyVoiceHttpStatus,
  generateSpeech,
  isRetryableVoiceFailure,
  listAccountVoices,
  RETRYABLE_VOICE_FAILURES,
  VOICE_FAILURE_CATEGORIES,
  VOICE_FAILURE_MESSAGES,
} from "@/lib/voice/provider";
import {
  isElevenLabsConfigured,
  resolveElevenLabsConfig,
} from "@/lib/voice/server-config";

/**
 * ElevenLabs voice provider behaviour, exercised entirely through an injected
 * fetch — zero real API calls, here or anywhere in the suite.
 */

// getServerEnv validates the whole environment; APP_URL is required.
process.env.APP_URL ||= "http://localhost:3000";

const TEST_KEY = "test-elevenlabs-key-never-real";

function configureElevenLabs() {
  vi.stubEnv("ELEVENLABS_API_KEY", TEST_KEY);
  resetServerEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("when ElevenLabs is not configured", () => {
  it("resolves to null with a reason, never throwing", () => {
    resetServerEnvCache();
    const { config, problems } = resolveElevenLabsConfig();
    expect(config).toBeNull();
    expect(problems.join(" ")).toMatch(/ELEVENLABS_API_KEY/);
    expect(isElevenLabsConfigured()).toBe(false);
  });

  it("refuses generation with the not_configured category", async () => {
    const fetchSpy = vi.fn();
    const result = await generateSpeech(
      { text: "Hello", voiceId: "v1", modelId: DEFAULT_VOICE_MODEL },
      fetchSpy as unknown as typeof fetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("not_configured");
    }
    // Disconnected means disconnected: not even one network call.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to list voices without a call", async () => {
    const fetchSpy = vi.fn();
    const result = await listAccountVoices(fetchSpy as unknown as typeof fetch);

    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("generation through a mocked platform", () => {
  it("sends the key only in the xi-api-key header and returns the audio", async () => {
    configureElevenLabs();

    const audio = new Uint8Array([1, 2, 3, 4]).buffer;
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(audio, { status: 200 }));

    const result = await generateSpeech(
      {
        text: "  A short line.  ",
        voiceId: "v1",
        modelId: DEFAULT_VOICE_MODEL,
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audio.byteLength).toBe(4);
      expect(result.contentType).toBe("audio/mpeg");
      expect(result.characterCount).toBe("A short line.".length);
    }

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(textToSpeechUrl("v1", VOICE_OUTPUT_FORMAT));
    expect(url.startsWith(ELEVENLABS_API_BASE)).toBe(true);
    const headers = init.headers as Record<string, string>;
    expect(headers[ELEVENLABS_AUTH_HEADER]).toBe(TEST_KEY);
    expect(url).not.toContain(TEST_KEY);
    expect(String(init.body)).not.toContain(TEST_KEY);
  });

  it("enforces the model's documented character limit before any request", async () => {
    configureElevenLabs();
    const fetchSpy = vi.fn();
    const model = VOICE_MODELS.find((m) => m.id === DEFAULT_VOICE_MODEL)!;

    const result = await generateSpeech(
      {
        text: "x".repeat(model.maxCharacters + 1),
        voiceId: "v1",
        modelId: model.id,
      },
      fetchSpy as unknown as typeof fetch,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe("text_too_long");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses empty text and a missing voice without a request", async () => {
    configureElevenLabs();
    const fetchSpy = vi.fn();

    const empty = await generateSpeech(
      { text: "   ", voiceId: "v1", modelId: DEFAULT_VOICE_MODEL },
      fetchSpy as unknown as typeof fetch,
    );
    const noVoice = await generateSpeech(
      { text: "Hello", voiceId: " ", modelId: DEFAULT_VOICE_MODEL },
      fetchSpy as unknown as typeof fetch,
    );

    expect(!empty.ok && empty.category).toBe("empty_text");
    expect(!noVoice.ok && noVoice.category).toBe("no_voice_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("classifies an unknown voice, a bad key and an outage distinctly", async () => {
    configureElevenLabs();

    for (const [status, category] of [
      [404, "invalid_voice"],
      [401, "unauthorised"],
      [429, "rate_limited"],
      [503, "provider_unavailable"],
    ] as const) {
      const fetchSpy = vi
        .fn()
        .mockResolvedValue(new Response("err", { status }));
      const result = await generateSpeech(
        { text: "Hello", voiceId: "v1", modelId: DEFAULT_VOICE_MODEL },
        fetchSpy as unknown as typeof fetch,
      );
      expect(!result.ok && result.category, String(status)).toBe(category);
    }
  });

  it("detects quota exhaustion without echoing the platform's body", async () => {
    configureElevenLabs();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: { status: "quota_exceeded" } }), {
        status: 401,
      }),
    );

    const result = await generateSpeech(
      { text: "Hello", voiceId: "v1", modelId: DEFAULT_VOICE_MODEL },
      fetchSpy as unknown as typeof fetch,
    );

    expect(!result.ok && result.category).toBe("quota_exceeded");
  });

  it("treats a network failure as retryable, not fatal", async () => {
    configureElevenLabs();
    const fetchSpy = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const result = await generateSpeech(
      { text: "Hello", voiceId: "v1", modelId: DEFAULT_VOICE_MODEL },
      fetchSpy as unknown as typeof fetch,
    );

    expect(!result.ok && result.category).toBe("transient");
    if (!result.ok) {
      expect(isRetryableVoiceFailure(result.category)).toBe(true);
    }
  });

  it("lists only well-formed voices from the account", async () => {
    configureElevenLabs();
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          voices: [
            { voice_id: "a", name: "Voice A" },
            { name: "missing id" },
            { voice_id: "b", name: "Voice B" },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await listAccountVoices(fetchSpy as unknown as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.voices).toEqual([
        { voiceId: "a", name: "Voice A" },
        { voiceId: "b", name: "Voice B" },
      ]);
    }
  });
});

describe("the failure vocabulary", () => {
  it("labels every category with a fixed sentence", () => {
    for (const category of VOICE_FAILURE_CATEGORIES) {
      expect(VOICE_FAILURE_MESSAGES[category]).toBeTruthy();
    }
  });

  it("marks only genuinely transient categories retryable", () => {
    expect([...RETRYABLE_VOICE_FAILURES]).toEqual([
      "rate_limited",
      "provider_unavailable",
      "transient",
    ]);
    expect(isRetryableVoiceFailure("unauthorised")).toBe(false);
    expect(isRetryableVoiceFailure("quota_exceeded")).toBe(false);
  });

  it("maps HTTP statuses conservatively", () => {
    expect(classifyVoiceHttpStatus(401)).toBe("unauthorised");
    expect(classifyVoiceHttpStatus(403)).toBe("unauthorised");
    expect(classifyVoiceHttpStatus(404)).toBe("invalid_voice");
    expect(classifyVoiceHttpStatus(422)).toBe("invalid_voice");
    expect(classifyVoiceHttpStatus(429)).toBe("rate_limited");
    expect(classifyVoiceHttpStatus(500)).toBe("provider_unavailable");
    expect(classifyVoiceHttpStatus(418)).toBe("unknown");
  });
});

describe("no cloning exists anywhere", () => {
  it("keeps voice-design and cloning endpoints out of the entire tree", () => {
    const files = readdirSync(join(process.cwd(), "src"), {
      recursive: true,
      encoding: "utf8",
    }).filter((entry) => /\.tsx?$/.test(entry));

    // The endpoint paths themselves, not prose about them: v1/voices/add is
    // instant cloning, ivc/pvc are the cloning products, text-to-voice is
    // voice design. None may appear in any source file.
    for (const file of files) {
      const contents = readFileSync(join(process.cwd(), "src", file), "utf8");
      expect(contents, file).not.toMatch(
        /voices\/add|text-to-voice|\/ivc\/|\/pvc\/|voice_cloning/i,
      );
    }
  });
});
