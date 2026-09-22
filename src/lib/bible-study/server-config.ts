import { getServerEnv } from "@/lib/env/server";

import type { BibleStudyProviderId } from "./types";

export const DEFAULT_BIBLE_STUDY_MODELS: Record<BibleStudyProviderId, string> =
  {
    anthropic: "claude-opus-5",
    openai: "gpt-5.6",
  };

export interface BibleStudyProviderConfig {
  provider: BibleStudyProviderId;
  model: string;
  apiKey: string;
}

export function resolveBibleStudyProviderConfig(
  provider: BibleStudyProviderId,
):
  | { config: BibleStudyProviderConfig; problems: [] }
  | { config: null; problems: string[] } {
  const env = getServerEnv();

  if (provider === "anthropic") {
    const apiKey =
      env.ANTHROPIC_API_KEY ??
      (env.AI_PROVIDER === undefined || env.AI_PROVIDER === "anthropic"
        ? env.AI_API_KEY
        : undefined);
    if (!apiKey) {
      return {
        config: null,
        problems: [
          "Anthropic is not configured for Bible Study generation. Configure ANTHROPIC_API_KEY (or the existing anthropic AI_API_KEY).",
        ],
      };
    }
    return {
      config: {
        provider,
        model:
          env.ANTHROPIC_MODEL ??
          (env.AI_PROVIDER === undefined || env.AI_PROVIDER === "anthropic"
            ? env.AI_MODEL
            : undefined) ??
          DEFAULT_BIBLE_STUDY_MODELS.anthropic,
        apiKey,
      },
      problems: [],
    };
  }

  const apiKey =
    env.OPENAI_API_KEY ??
    (env.AI_PROVIDER === "openai" ? env.AI_API_KEY : undefined);
  if (!apiKey) {
    return {
      config: null,
      problems: [
        "OpenAI is not configured for Bible Study generation. Configure OPENAI_API_KEY (or AI_PROVIDER=openai with AI_API_KEY).",
      ],
    };
  }

  return {
    config: {
      provider,
      model: env.OPENAI_MODEL ?? DEFAULT_BIBLE_STUDY_MODELS.openai,
      apiKey,
    },
    problems: [],
  };
}

export function bibleStudyProviderConfigured(
  provider: BibleStudyProviderId,
): boolean {
  return resolveBibleStudyProviderConfig(provider).config !== null;
}
