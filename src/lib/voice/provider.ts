import {
  ELEVENLABS_AUTH_HEADER,
  textToSpeechUrl,
  voiceModelById,
  VOICE_OUTPUT_FORMAT,
  VOICE_OUTPUT_MIME,
  VOICES_URL,
} from "./config";
import { resolveElevenLabsConfig } from "./server-config";

/**
 * The ElevenLabs voice provider.
 *
 * One capability: turn approved script text into speech using **a voice that
 * already exists in Dave's account**. There are no cloning calls, no voice
 * design calls, and no path that could create a voice — the provider can only
 * reference an id, and an unknown id is a classified refusal.
 *
 * The API key travels in the `xi-api-key` header and nowhere else. Error
 * details from the platform are mapped to fixed sentences rather than echoed:
 * a provider message can quote the request, and the request contains Dave's
 * script.
 */

export const VOICE_FAILURE_CATEGORIES = [
  "not_configured",
  "no_voice_configured",
  "invalid_voice",
  "text_too_long",
  "empty_text",
  "unauthorised",
  "quota_exceeded",
  "rate_limited",
  "provider_unavailable",
  "transient",
  "unknown",
] as const;
export type VoiceFailureCategory = (typeof VOICE_FAILURE_CATEGORIES)[number];

export const RETRYABLE_VOICE_FAILURES: readonly VoiceFailureCategory[] = [
  "rate_limited",
  "provider_unavailable",
  "transient",
];

export function isRetryableVoiceFailure(
  category: VoiceFailureCategory,
): boolean {
  return RETRYABLE_VOICE_FAILURES.includes(category);
}

export const VOICE_FAILURE_MESSAGES: Record<VoiceFailureCategory, string> = {
  not_configured:
    "ElevenLabs is not configured. Narration needs ELEVENLABS_API_KEY in the server environment.",
  no_voice_configured:
    "No voice is configured. Choose a voice from your ElevenLabs account in Settings.",
  invalid_voice:
    "ElevenLabs does not recognise the configured voice. Choose one that exists in your account.",
  text_too_long:
    "The script is longer than the model's documented per-request limit. Shorten it or split it — nothing is silently truncated.",
  empty_text: "There is no text to narrate.",
  unauthorised:
    "ElevenLabs rejected the API key. Check the configured credential.",
  quota_exceeded:
    "The ElevenLabs character quota is exhausted for this billing period.",
  rate_limited: "ElevenLabs rate limited the request. It can be retried.",
  provider_unavailable: "ElevenLabs is unavailable. It can be retried.",
  transient: "The request to ElevenLabs could not be completed.",
  unknown: "ElevenLabs refused the request.",
};

export interface SpeechSuccess {
  ok: true;
  audio: Uint8Array;
  contentType: string;
  characterCount: number;
  modelId: string;
  voiceId: string;
}

export interface SpeechFailure {
  ok: false;
  category: VoiceFailureCategory;
}

export type SpeechResult = SpeechSuccess | SpeechFailure;

export function classifyVoiceHttpStatus(status: number): VoiceFailureCategory {
  if (status === 401 || status === 403) {
    return "unauthorised";
  }
  if (status === 404) {
    return "invalid_voice";
  }
  if (status === 422) {
    return "invalid_voice";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  return "unknown";
}

/**
 * Generate speech.
 *
 * The character limit is enforced **before** the request using the model's
 * documented figure, and the count sent is returned for the job record.
 */
export async function generateSpeech(
  input: {
    text: string;
    voiceId: string;
    modelId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<SpeechResult> {
  const { config } = resolveElevenLabsConfig();
  if (config === null) {
    return { ok: false, category: "not_configured" };
  }

  const text = input.text.trim();
  if (text === "") {
    return { ok: false, category: "empty_text" };
  }

  const model = voiceModelById(input.modelId);
  if (model === null) {
    // An unknown model has no documented limit to enforce, so it is refused
    // rather than guessed at.
    return { ok: false, category: "unknown" };
  }
  if (text.length > model.maxCharacters) {
    return { ok: false, category: "text_too_long" };
  }

  if (input.voiceId.trim() === "") {
    return { ok: false, category: "no_voice_configured" };
  }

  let response: Response;
  try {
    response = await fetchImpl(
      textToSpeechUrl(input.voiceId, VOICE_OUTPUT_FORMAT),
      {
        method: "POST",
        headers: {
          [ELEVENLABS_AUTH_HEADER]: config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, model_id: model.id }),
      },
    );
  } catch {
    return { ok: false, category: "transient" };
  }

  if (!response.ok) {
    // 401 with a quota message is how the platform reports exhaustion; the
    // status alone cannot distinguish it, so peek at the body's shape without
    // echoing any of it.
    if (response.status === 401) {
      const body = await response.text().catch(() => "");
      if (/quota/i.test(body)) {
        return { ok: false, category: "quota_exceeded" };
      }
    }
    return { ok: false, category: classifyVoiceHttpStatus(response.status) };
  }

  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0) {
    return { ok: false, category: "unknown" };
  }

  return {
    ok: true,
    audio,
    contentType: VOICE_OUTPUT_MIME,
    characterCount: text.length,
    modelId: model.id,
    voiceId: input.voiceId,
  };
}

export interface VoiceListing {
  voiceId: string;
  name: string;
}

/**
 * The voices the connected account actually has. Used to validate the
 * configured voice at settings time — the provider never offers free text a
 * typo could send narration to a voice that does not exist.
 */
export async function listAccountVoices(
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { ok: true; voices: VoiceListing[] }
  | { ok: false; category: VoiceFailureCategory }
> {
  const { config } = resolveElevenLabsConfig();
  if (config === null) {
    return { ok: false, category: "not_configured" };
  }

  let response: Response;
  try {
    response = await fetchImpl(VOICES_URL, {
      headers: { [ELEVENLABS_AUTH_HEADER]: config.apiKey },
    });
  } catch {
    return { ok: false, category: "transient" };
  }

  if (!response.ok) {
    return { ok: false, category: classifyVoiceHttpStatus(response.status) };
  }

  const body = (await response.json().catch(() => null)) as {
    voices?: { voice_id?: string; name?: string }[];
  } | null;

  const voices = (body?.voices ?? [])
    .filter(
      (voice): voice is { voice_id: string; name: string } =>
        typeof voice.voice_id === "string" && typeof voice.name === "string",
    )
    .map((voice) => ({ voiceId: voice.voice_id, name: voice.name }));

  return { ok: true, voices };
}
