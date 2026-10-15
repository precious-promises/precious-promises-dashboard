export type MultimodalProviderId = "openai";

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  model: string;
}

export interface TranscriptionResult {
  text: string;
  model: string;
}

export interface GeneratedSpeech {
  bytes: Uint8Array;
  mimeType: "audio/mpeg";
  model: string;
  voice: string;
}

export type MultimodalFailureCategory =
  | "not_configured"
  | "invalid_input"
  | "rate_limited"
  | "provider_unavailable"
  | "refused"
  | "invalid_output"
  | "transient"
  | "unknown";

export type MultimodalResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      category: MultimodalFailureCategory;
      detail: string;
    };

export interface ImageGenerationRequest {
  prompt: string;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  background?: "auto" | "opaque" | "transparent";
}

export interface AudioTranscriptionRequest {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  prompt?: string;
}

export interface SpeechGenerationRequest {
  text: string;
  voice?: string;
  instructions?: string;
}

export interface MultimodalProvider {
  readonly id: MultimodalProviderId;
  readonly imageModel: string;
  readonly transcriptionModel: string;
  readonly speechModel: string;

  generateImage(
    request: ImageGenerationRequest,
  ): Promise<MultimodalResult<GeneratedImage>>;

  transcribeAudio(
    request: AudioTranscriptionRequest,
  ): Promise<MultimodalResult<TranscriptionResult>>;

  generateSpeech(
    request: SpeechGenerationRequest,
  ): Promise<MultimodalResult<GeneratedSpeech>>;
}
