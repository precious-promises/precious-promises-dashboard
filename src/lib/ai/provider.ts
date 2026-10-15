import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider } from "./openai-provider";
import { resolveAiConfig } from "./server-config";
import type { AIProvider } from "./types";

export interface AiProviderResult {
  provider: AIProvider | null;
  problems: string[];
}

export function getAiProvider(): AiProviderResult {
  const { config, problems } = resolveAiConfig();
  if (config === null) return { provider: null, problems };

  return {
    provider:
      config.provider === "openai"
        ? new OpenAIProvider(config.model, config.apiKey)
        : new AnthropicProvider(config.model, config.apiKey),
    problems: [],
  };
}
