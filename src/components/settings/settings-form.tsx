"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { SettingsActionState } from "@/app/dashboard/settings/actions";
import { saveSettings } from "@/app/dashboard/settings/actions";
import type { VoiceListing } from "@/lib/voice/provider";

const FIELD =
  "w-full rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus-visible:border-highlight focus-visible:ring-2 focus-visible:ring-highlight/35";
const LABEL = "mb-1.5 block text-sm font-medium text-ink-secondary";

interface VoiceModelOption {
  id: string;
  label: string;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-highlight px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export function SettingsForm({
  defaults,
  voices,
  voicesUnavailableReason,
  voiceModels,
}: {
  defaults: {
    timezone: string;
    default_aspect_ratio: string;
    default_cta: string | null;
    brand_line: string | null;
    elevenlabs_voice_id: string | null;
    elevenlabs_model_id: string | null;
  };
  /** Voices read live from the connected account, or null when unreadable. */
  voices: VoiceListing[] | null;
  voicesUnavailableReason: string | null;
  voiceModels: VoiceModelOption[];
}) {
  const [state, formAction] = useActionState(
    saveSettings,
    {} as SettingsActionState,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-200"
        >
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-edge bg-panel-raised/50 px-3.5 py-2.5 text-sm text-ink-secondary"
        >
          {state.notice}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="settings-timezone" className={LABEL}>
            Timezone
          </label>
          <input
            id="settings-timezone"
            name="timezone"
            defaultValue={defaults.timezone}
            className={FIELD}
            placeholder="Europe/London"
          />
          {errors.timezone ? (
            <p className="mt-1.5 text-sm text-red-300">{errors.timezone}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="settings-aspect" className={LABEL}>
            Default video dimensions
          </label>
          <select
            id="settings-aspect"
            name="default_aspect_ratio"
            defaultValue={defaults.default_aspect_ratio}
            className={FIELD}
          >
            <option value="9:16">
              9:16 — vertical (Shorts, Reels, TikTok)
            </option>
            <option value="16:9">16:9 — standard YouTube</option>
            <option value="1:1">1:1 — square</option>
          </select>
        </div>

        <div>
          <label htmlFor="settings-cta" className={LABEL}>
            Default call to action
          </label>
          <input
            id="settings-cta"
            name="default_cta"
            defaultValue={defaults.default_cta ?? ""}
            className={FIELD}
            placeholder="Subscribe for daily promises…"
          />
        </div>

        <div>
          <label htmlFor="settings-brand" className={LABEL}>
            Brand line
          </label>
          <input
            id="settings-brand"
            name="brand_line"
            defaultValue={defaults.brand_line ?? ""}
            className={FIELD}
            placeholder="Shown as the watermark line on rendered videos"
          />
        </div>

        <div>
          <label htmlFor="settings-voice" className={LABEL}>
            ElevenLabs voice
          </label>
          {voices !== null ? (
            <select
              id="settings-voice"
              name="elevenlabs_voice_id"
              defaultValue={defaults.elevenlabs_voice_id ?? ""}
              className={FIELD}
            >
              <option value="">No voice chosen</option>
              {voices.map((voice) => (
                <option key={voice.voiceId} value={voice.voiceId}>
                  {voice.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                id="settings-voice"
                name="elevenlabs_voice_id"
                defaultValue={defaults.elevenlabs_voice_id ?? ""}
                className={FIELD}
                placeholder="Voice id from your ElevenLabs account"
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                {voicesUnavailableReason ?? "The voice list could not be read."}{" "}
                The id is stored as-is and validated once ElevenLabs is
                connected. Only a voice that already exists in your account can
                ever be used — nothing here creates or clones voices.
              </p>
            </>
          )}
        </div>

        <div>
          <label htmlFor="settings-voice-model" className={LABEL}>
            Narration model
          </label>
          <select
            id="settings-voice-model"
            name="elevenlabs_model_id"
            defaultValue={defaults.elevenlabs_model_id ?? ""}
            className={FIELD}
          >
            <option value="">Default (Multilingual v2)</option>
            {voiceModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SaveButton />
    </form>
  );
}
