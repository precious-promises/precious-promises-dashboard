import { getServerEnv } from "@/lib/env/server";

/**
 * ElevenLabs configuration, resolved server-side.
 *
 * The key is server-only, never logged, never echoed, and the interface may
 * only ever say Configured / Not configured. Follows the house pattern:
 * reasons, never throws, never values.
 */

export interface ElevenLabsConfig {
  apiKey: string;
  /** The env-level default voice; the owner's setting overrides it. */
  defaultVoiceId: string | null;
}

export interface ElevenLabsConfigResult {
  config: ElevenLabsConfig | null;
  problems: string[];
}

export function resolveElevenLabsConfig(): ElevenLabsConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  if (!env.ELEVENLABS_API_KEY) {
    problems.push("ELEVENLABS_API_KEY is not configured.");
  }

  if (problems.length > 0) {
    return { config: null, problems };
  }

  return {
    config: {
      apiKey: env.ELEVENLABS_API_KEY as string,
      defaultVoiceId: env.ELEVENLABS_DEFAULT_VOICE_ID ?? null,
    },
    problems: [],
  };
}

export function isElevenLabsConfigured(): boolean {
  return resolveElevenLabsConfig().config !== null;
}
