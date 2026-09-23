import type {
  AudioTranscriptionRequest,
  GeneratedImage,
  GeneratedSpeech,
  ImageGenerationRequest,
  MultimodalProvider,
  MultimodalResult,
  SpeechGenerationRequest,
  TranscriptionResult,
} from "./types";
import type { OpenAIMultimodalConfig } from "./server-config";

function classify(status: number) {
  if (status === 429) return "rate_limited" as const;
  if (status >= 500) return "provider_unavailable" as const;
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return "invalid_input" as const;
  }
  return "refused" as const;
}

function base64Bytes(value: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

export class OpenAIMultimodalProvider implements MultimodalProvider {
  readonly id = "openai" as const;
  readonly imageModel: string;
  readonly transcriptionModel: string;
  readonly speechModel: string;

  constructor(
    private readonly config: OpenAIMultimodalConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.imageModel = config.imageModel;
    this.transcriptionModel = config.transcriptionModel;
    this.speechModel = config.speechModel;
  }

  async generateImage(
    request: ImageGenerationRequest,
  ): Promise<MultimodalResult<GeneratedImage>> {
    const prompt = request.prompt.trim();
    if (!prompt) {
      return {
        ok: false,
        category: "invalid_input",
        detail: "An image prompt is required.",
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.imageModel,
            prompt,
            size: request.size ?? "1024x1024",
            background: request.background ?? "auto",
            output_format: "png",
          }),
        },
      );
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The OpenAI image request could not be completed.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        category: classify(response.status),
        detail: "OpenAI did not return an image.",
      };
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: { b64_json?: string }[] }
      | null;
    const encoded = body?.data?.[0]?.b64_json;
    const bytes = encoded ? base64Bytes(encoded) : null;
    if (!bytes || bytes.byteLength === 0) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "OpenAI returned no usable image bytes.",
      };
    }

    return {
      ok: true,
      value: {
        bytes,
        mimeType: "image/png",
        model: this.imageModel,
      },
    };
  }

  async transcribeAudio(
    request: AudioTranscriptionRequest,
  ): Promise<MultimodalResult<TranscriptionResult>> {
    if (request.bytes.byteLength === 0 || !request.filename.trim()) {
      return {
        ok: false,
        category: "invalid_input",
        detail: "A non-empty audio file with a filename is required.",
      };
    }

    const form = new FormData();
    form.append("model", this.transcriptionModel);
    form.append(
      "file",
      new Blob([request.bytes.slice().buffer], { type: request.mimeType }),
      request.filename,
    );
    if (request.prompt?.trim()) form.append("prompt", request.prompt.trim());

    let response: Response;
    try {
      response = await this.fetchImpl(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: form,
        },
      );
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The OpenAI transcription request could not be completed.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        category: classify(response.status),
        detail: "OpenAI did not return a transcription.",
      };
    }

    const body = (await response.json().catch(() => null)) as
      | { text?: string }
      | null;
    if (!body?.text?.trim()) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "OpenAI returned no transcription text.",
      };
    }

    return {
      ok: true,
      value: { text: body.text.trim(), model: this.transcriptionModel },
    };
  }

  async generateSpeech(
    request: SpeechGenerationRequest,
  ): Promise<MultimodalResult<GeneratedSpeech>> {
    const text = request.text.trim();
    if (!text) {
      return {
        ok: false,
        category: "invalid_input",
        detail: "Text is required for speech generation.",
      };
    }
    if (text.length > 4096) {
      return {
        ok: false,
        category: "invalid_input",
        detail:
          "OpenAI speech requests are limited to 4096 input characters; split longer narration instead of truncating it.",
      };
    }

    const voice = request.voice?.trim() || this.config.speechVoice;

    let response: Response;
    try {
      response = await this.fetchImpl("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.speechModel,
          input: text,
          voice,
          instructions: request.instructions?.trim() || undefined,
          response_format: "mp3",
        }),
      });
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The OpenAI speech request could not be completed.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        category: classify(response.status),
        detail: "OpenAI did not return speech audio.",
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      return {
        ok: false,
        category: "invalid_output",
        detail: "OpenAI returned an empty speech file.",
      };
    }

    return {
      ok: true,
      value: {
        bytes,
        mimeType: "audio/mpeg",
        model: this.speechModel,
        voice,
      },
    };
  }
}
