import { describe, expect, it, vi } from "vitest";

import { OpenAIProvider } from "@/lib/ai/openai-provider";
import { OpenAIMultimodalProvider } from "@/lib/multimodal/openai-provider";
import type { OpenAIMultimodalConfig } from "@/lib/multimodal/server-config";

const config: OpenAIMultimodalConfig = {
  apiKey: "test-key",
  imageModel: "gpt-image-2.5-flare",
  transcriptionModel: "gpt-transcribe",
  speechModel: "gpt-4o-mini-tts",
  speechVoice: "marin",
};

// Final integration regression coverage after provider config compatibility.
describe("OpenAI provider layer", () => {
  it("uses the closed dashboard schema for ordinary drafting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ title: "A faithful title" }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const provider = new OpenAIProvider("gpt-5.6", "test-key", fetchImpl);
    const result = await provider.generateDraft({
      type: "title",
      instruction: "Draft a title.",
      scripture: null,
      workingMaterial: "Approved study",
      platform: "youtube",
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
  });

  it("rejects extra Scripture-shaped fields even when OpenAI returns them", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    title: "Title",
                    scripture: "untrusted replacement",
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new OpenAIProvider("gpt-5.6", "test-key", fetchImpl);
    const result = await provider.generateDraft({
      type: "title",
      instruction: "Draft a title.",
      scripture: null,
      workingMaterial: null,
      platform: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe("invalid_output");
  });

  it("generates image bytes through the multimodal seam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("image-bytes").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new OpenAIMultimodalProvider(config, fetchImpl);
    const result = await provider.generateImage({
      prompt: "Bible study cover",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.bytes.byteLength).toBeGreaterThan(0);
  });

  it("transcribes uploaded audio through the multimodal seam", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Romans chapter eight" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new OpenAIMultimodalProvider(config, fetchImpl);
    const result = await provider.transcribeAudio({
      bytes: new Uint8Array([1, 2, 3]),
      filename: "request.webm",
      mimeType: "audio/webm",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.text).toBe("Romans chapter eight");
  });

  it("generates optional OpenAI speech without replacing ElevenLabs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    const provider = new OpenAIMultimodalProvider(config, fetchImpl);
    const result = await provider.generateSpeech({
      text: "Approved narration",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.voice).toBe("marin");
  });

  it("refuses empty multimodal requests before spending tokens", async () => {
    const fetchImpl = vi.fn();
    const provider = new OpenAIMultimodalProvider(config, fetchImpl);
    const image = await provider.generateImage({ prompt: "   " });
    const audio = await provider.generateSpeech({ text: "" });
    expect(image.ok).toBe(false);
    expect(audio.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
