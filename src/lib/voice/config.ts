/**
 * ElevenLabs API constants.
 *
 * Read from the official documentation at implementation time (August 2026):
 * the text-to-speech endpoint, its authentication header, and each model's
 * documented per-request character limit. The hostname lives here and only
 * here — the same confinement every platform host in this codebase obeys.
 *
 * Where a limit could not be verified against current official
 * documentation, it is not asserted.
 */

export const ELEVENLABS_API_BASE = "https://api.elevenlabs.io";

/** `POST {base}/v1/text-to-speech/{voiceId}` returns the audio bytes. */
export function textToSpeechUrl(voiceId: string, outputFormat: string): string {
  return `${ELEVENLABS_API_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
}

/** `GET {base}/v1/voices` lists the voices the account can use. */
export const VOICES_URL = `${ELEVENLABS_API_BASE}/v1/voices`;

/** The API key travels in this header and nowhere else. */
export const ELEVENLABS_AUTH_HEADER = "xi-api-key";

/**
 * MP3 at 44.1kHz / 128kbps — the documented default, stored as-is. One
 * format, deliberately: a single stored shape keeps every consumer simple.
 */
export const VOICE_OUTPUT_FORMAT = "mp3_44100_128";
export const VOICE_OUTPUT_MIME = "audio/mpeg";

/**
 * Documented per-request character limits, per model.
 *
 * `eleven_multilingual_v2` is the default: the documented high-quality
 * general model, with the larger 10,000-character request limit. A script
 * longer than the limit is refused with the limit named — never silently
 * truncated, because a narration missing its ending would be a quiet lie.
 */
export const VOICE_MODELS = [
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    maxCharacters: 10_000,
  },
  { id: "eleven_v3", label: "Eleven v3", maxCharacters: 5_000 },
] as const;

export type VoiceModelId = (typeof VOICE_MODELS)[number]["id"];

export const DEFAULT_VOICE_MODEL: VoiceModelId = "eleven_multilingual_v2";

export function voiceModelById(id: string) {
  return VOICE_MODELS.find((model) => model.id === id) ?? null;
}

/** What narration is allowed to read: the spoken script sections, joined. */
export const NARRATION_SECTION_SEPARATOR = "\n\n";
