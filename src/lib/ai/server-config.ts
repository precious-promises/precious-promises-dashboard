import { getServerEnv } from "@/lib/env/server";

/**
 * AI provider configuration.
 *
 * `AI_PROVIDER` names the implementation, `AI_MODEL` the model, `AI_API_KEY`
 * the credential — the generic names the env schema has carried since the
 * variables were reserved. One provider is implemented: `anthropic`, chosen
 * for its schema-constrained outputs (docs/stage-11-final-production-automation.md
 * records the reasoning). Configuring an unimplemented provider is a named
 * problem, not a silent fallback.
 */

export const SUPPORTED_AI_PROVIDER = "anthropic";
export const DEFAULT_AI_MODEL = "claude-opus-5";

export interface AiConfig {
  provider: typeof SUPPORTED_AI_PROVIDER;
  model: string;
  apiKey: string;
}

export interface AiConfigResult {
  config: AiConfig | null;
  problems: string[];
}

export function resolveAiConfig(): AiConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  const provider = env.AI_PROVIDER ?? SUPPORTED_AI_PROVIDER;
  if (provider !== SUPPORTED_AI_PROVIDER) {
    problems.push(
      `AI_PROVIDER is set to an unimplemented provider. Only "${SUPPORTED_AI_PROVIDER}" is implemented.`,
    );
  }

  if (!env.AI_API_KEY) {
    problems.push("AI_API_KEY is not configured.");
  }

  if (problems.length > 0) {
    return { config: null, problems };
  }

  return {
    config: {
      provider: SUPPORTED_AI_PROVIDER,
      model: env.AI_MODEL ?? DEFAULT_AI_MODEL,
      apiKey: env.AI_API_KEY as string,
    },
    problems: [],
  };
}

export function isAiConfigured(): boolean {
  return resolveAiConfig().config !== null;
}
