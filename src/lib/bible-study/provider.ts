import { AnthropicBibleStudyProvider } from "./providers/anthropic";
import { OpenAIBibleStudyProvider } from "./providers/openai";
import { resolveBibleStudyProviderConfig } from "./server-config";
import type { BibleStudyProvider, BibleStudyProviderId } from "./types";

export function getBibleStudyProvider(
  id: BibleStudyProviderId,
): { provider: BibleStudyProvider | null; problems: string[] } {
  const { config, problems } = resolveBibleStudyProviderConfig(id);
  if (!config) return { provider: null, problems };

  if (id === "anthropic") {
    return {
      provider: new AnthropicBibleStudyProvider(config.model, config.apiKey),
      problems: [],
    };
  }

  return {
    provider: new OpenAIBibleStudyProvider(config.model, config.apiKey),
    problems: [],
  };
}
