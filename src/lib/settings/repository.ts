import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/schedule/timezone";

import { SETTINGS_DEFAULTS, type AppSettings } from "./types";

/**
 * Load the owner's settings, or the defaults when none are stored yet.
 * Reading never writes: the row is created the first time settings are
 * saved, not the first time the page renders.
 */
export async function loadAppSettings(): Promise<AppSettings | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  return (data as AppSettings | null) ?? null;
}

/** The effective settings — stored values over defaults. */
export function effectiveSettings(stored: AppSettings | null) {
  return {
    timezone:
      stored?.timezone && isValidTimeZone(stored.timezone)
        ? stored.timezone
        : SETTINGS_DEFAULTS.timezone,
    default_aspect_ratio:
      stored?.default_aspect_ratio ?? SETTINGS_DEFAULTS.default_aspect_ratio,
    default_cta: stored?.default_cta ?? SETTINGS_DEFAULTS.default_cta,
    brand_line: stored?.brand_line ?? SETTINGS_DEFAULTS.brand_line,
    elevenlabs_voice_id:
      stored?.elevenlabs_voice_id ?? SETTINGS_DEFAULTS.elevenlabs_voice_id,
    elevenlabs_model_id:
      stored?.elevenlabs_model_id ?? SETTINGS_DEFAULTS.elevenlabs_model_id,
  };
}
