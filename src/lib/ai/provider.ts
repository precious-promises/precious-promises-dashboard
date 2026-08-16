import { AnthropicProvider } from "./anthropic-provider";
import { resolveAiConfig } from "./server-config";
import type { AIProvider } from "./types";

/**
 * Resolve the configured AI provider, or `null` with reasons.
 *
 * The same seam-over-stub shape as rendering and publishing: `null` means
 * nothing can generate, callers must handle the absence, and the interface
 * reports Configured / Not configured rather than pretending.
 */
export interface AiProviderResult {
  provider: AIProvider | null;
  problems: string[];
}

export function getAiProvider(): AiProviderResult {
  const { config, problems } = resolveAiConfig();
  if (config === null) {
    return { provider: null, problems };
  }

  return {
    provider: new AnthropicProvider(config.model, config.apiKey),
    problems: [],
  };
}
