import { getServerEnv } from "@/lib/env/server";

export const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2.5-flare";
export const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-transcribe";
export const DEFAULT_OPENAI_SPEECH_MODEL = "gpt-4o-mini-tts";
export const DEFAULT_OPENAI_SPEECH_VOICE = "marin";

export interface OpenAIMultimodalConfig {
  apiKey: string;
  imageModel: string;
  transcriptionModel: string;
  speechModel: string;
  speechVoice: string;
}

export function resolveOpenAIMultimodalConfig(): {
  config: OpenAIMultimodalConfig | null;
  problems: string[];
} {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    return {
      config: null,
      problems: [
        "OPENAI_API_KEY is not configured, so OpenAI multimodal capabilities are unavailable.",
      ],
    };
  }

  return {
    config: {
      apiKey: env.OPENAI_API_KEY,
      imageModel: env.OPENAI_IMAGE_MODEL ?? DEFAULT_OPENAI_IMAGE_MODEL,
      transcriptionModel:
        env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
      speechModel: env.OPENAI_SPEECH_MODEL ?? DEFAULT_OPENAI_SPEECH_MODEL,
      speechVoice: env.OPENAI_SPEECH_VOICE ?? DEFAULT_OPENAI_SPEECH_VOICE,
    },
    problems: [],
  };
}

export function isOpenAIMultimodalConfigured(): boolean {
  return resolveOpenAIMultimodalConfig().config !== null;
}
