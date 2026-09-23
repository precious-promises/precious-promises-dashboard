import { getServerEnv } from "@/lib/env/server";

export const SUPPORTED_AI_PROVIDER = "anthropic";
export const SUPPORTED_AI_PROVIDERS = [
  SUPPORTED_AI_PROVIDER,
  "openai",
] as const;
export type SupportedAiProvider = (typeof SUPPORTED_AI_PROVIDERS)[number];

export const DEFAULT_AI_MODELS: Record<SupportedAiProvider, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-5.6",
};

export interface AiConfig {
  provider: SupportedAiProvider;
  model: string;
  apiKey: string;
}

export interface AiConfigResult {
  config: AiConfig | null;
  problems: string[];
}

/**
 * Resolve the ordinary drafting provider.
 *
 * The generic AI_* variables remain backwards-compatible. Provider-specific
 * keys take precedence so Bible Study and multimodal OpenAI capabilities can
 * coexist with Claude without swapping a shared credential.
 */
export function resolveAiConfig(): AiConfigResult {
  const env = getServerEnv();
  const requestedProvider = env.AI_PROVIDER ?? SUPPORTED_AI_PROVIDER;

  if (
    !SUPPORTED_AI_PROVIDERS.includes(requestedProvider as SupportedAiProvider)
  ) {
    return {
      config: null,
      problems: [
        `AI_PROVIDER is set to an unimplemented provider. Supported providers are ${SUPPORTED_AI_PROVIDERS.join(", ")}.`,
      ],
    };
  }

  const provider = requestedProvider as SupportedAiProvider;

  if (provider === "openai") {
    const apiKey = env.OPENAI_API_KEY ?? env.AI_API_KEY;
    if (!apiKey) {
      return {
        config: null,
        problems: [
          "OpenAI drafting is not configured. Configure OPENAI_API_KEY or AI_API_KEY.",
        ],
      };
    }
    return {
      config: {
        provider,
        model: env.OPENAI_MODEL ?? env.AI_MODEL ?? DEFAULT_AI_MODELS.openai,
        apiKey,
      },
      problems: [],
    };
  }

  const apiKey = env.ANTHROPIC_API_KEY ?? env.AI_API_KEY;
  if (!apiKey) {
    return {
      config: null,
      problems: [
        "Anthropic drafting is not configured. Configure ANTHROPIC_API_KEY or AI_API_KEY.",
      ],
    };
  }
  return {
    config: {
      provider,
      model: env.ANTHROPIC_MODEL ?? env.AI_MODEL ?? DEFAULT_AI_MODELS.anthropic,
      apiKey,
    },
    problems: [],
  };
}

export function isAiConfigured(): boolean {
  return resolveAiConfig().config !== null;
}
