import { OpenAIMultimodalProvider } from "./openai-provider";
import { resolveOpenAIMultimodalConfig } from "./server-config";
import type { MultimodalProvider } from "./types";

export function getMultimodalProvider(): {
  provider: MultimodalProvider | null;
  problems: string[];
} {
  const { config, problems } = resolveOpenAIMultimodalConfig();
  if (!config) return { provider: null, problems };
  return {
    provider: new OpenAIMultimodalProvider(config),
    problems: [],
  };
}
