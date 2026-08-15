import { getServerEnv } from "@/lib/env/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";

/**
 * Whether this runtime is allowed and able to render video.
 *
 * Rendering needs three things: the operator's explicit opt-in
 * (`RENDER_ENABLED=true` — headless Chromium and FFmpeg are not a given in
 * every runtime), the trusted worker credential (output goes to the private
 * bucket and the job tables), and the Remotion packages, which are a
 * build-time fact rather than a runtime check.
 *
 * Follows the house pattern: returns reasons, never throws, never names a
 * secret value.
 */

export interface RenderConfig {
  enabled: true;
}

export interface RenderConfigResult {
  config: RenderConfig | null;
  problems: string[];
}

export function resolveRenderConfig(): RenderConfigResult {
  const problems: string[] = [];
  const env = getServerEnv();

  if (env.RENDER_ENABLED !== "true") {
    problems.push(
      'RENDER_ENABLED is not set to "true". Server rendering stays off until the runtime is confirmed able to run headless Chromium and FFmpeg.',
    );
  }

  if (!isWorkerConfigured()) {
    problems.push(
      "SUPABASE_SECRET_KEY is not configured, so rendered output could not be stored or recorded.",
    );
  }

  return problems.length > 0
    ? { config: null, problems }
    : { config: { enabled: true }, problems: [] };
}

export function isRenderConfigured(): boolean {
  return resolveRenderConfig().config !== null;
}
