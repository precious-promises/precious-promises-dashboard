import type { AspectRatio } from "@/lib/video/types";

/**
 * Owner settings.
 *
 * Preferences only — **never a credential**. Secrets live in the deployment
 * environment and the interface reports them exclusively as Configured /
 * Not configured through the readiness surface, which reads the
 * `is*Configured()` functions and nothing else.
 */

export interface AppSettings {
  id: string;
  owner_id: string;
  timezone: string;
  default_aspect_ratio: AspectRatio;
  default_cta: string | null;
  brand_line: string | null;
  elevenlabs_voice_id: string | null;
  elevenlabs_model_id: string | null;
  created_at: string;
  updated_at: string;
}

export const SETTINGS_DEFAULTS = {
  timezone: "Europe/London",
  default_aspect_ratio: "9:16" as AspectRatio,
  default_cta: null as string | null,
  brand_line: null as string | null,
  elevenlabs_voice_id: null as string | null,
  elevenlabs_model_id: null as string | null,
};

/** One integration's operational readiness, stated without values. */
export interface ReadinessEntry {
  id: string;
  label: string;
  configured: boolean;
  /** IMPLEMENTED / CONNECTED / LIVE-VERIFIED style status text. */
  status: string;
  detail: string;
}
