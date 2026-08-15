import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SettingsForm } from "@/components/settings/settings-form";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { isAiConfigured, resolveAiConfig } from "@/lib/ai/server-config";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { isRenderConfigured } from "@/lib/render/server-config";
import { effectiveSettings, loadAppSettings } from "@/lib/settings/repository";
import type { ReadinessEntry } from "@/lib/settings/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { VOICE_MODELS } from "@/lib/voice/config";
import { isElevenLabsConfigured } from "@/lib/voice/server-config";
import { listAccountVoices } from "@/lib/voice/provider";
import { analyticsSchedulingConnected } from "@/trigger/analytics";
import { CONNECTED_ACCOUNTS_PATH } from "@/config/navigation";

export const metadata: Metadata = {
  title: "Settings · Precious Promises",
  robots: { index: false, follow: false },
};

/**
 * Settings: owner preferences, and the operational readiness board.
 *
 * **No secret value is ever displayed or returned to the browser.** Each
 * integration reports Configured / Not configured — a boolean derived
 * server-side — and nothing more. Connections to social platforms live on
 * Connected Accounts; this page links there rather than duplicating it.
 */
export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const stored = await loadAppSettings();
  const defaults = effectiveSettings(stored);

  const elevenLabsConfigured = isElevenLabsConfigured();
  const voicesResult = elevenLabsConfigured ? await listAccountVoices() : null;
  const voices = voicesResult && voicesResult.ok ? voicesResult.voices : null;
  const voicesUnavailableReason = !elevenLabsConfigured
    ? "ElevenLabs is not configured, so the account's voices cannot be listed yet."
    : voicesResult && !voicesResult.ok
      ? "ElevenLabs did not return the account's voices just now."
      : null;

  const aiConfig = resolveAiConfig();

  const readiness: ReadinessEntry[] = [
    {
      id: "ai",
      label: "AI assistance (Anthropic)",
      configured: isAiConfigured(),
      status: isAiConfigured() ? "CONFIGURED" : "NOT CONFIGURED",
      detail: isAiConfigured()
        ? `Implemented and configured (model ${aiConfig.config?.model}). Drafts only — nothing AI produces is approved or published by it.`
        : "Implemented, not configured. Drafting needs AI_API_KEY in the server environment.",
    },
    {
      id: "voice",
      label: "Voice generation (ElevenLabs)",
      configured: elevenLabsConfigured,
      status: elevenLabsConfigured ? "CONFIGURED" : "NOT CONFIGURED",
      detail: elevenLabsConfigured
        ? "Implemented and configured. Narration uses only a voice that exists in the connected account; no cloning exists anywhere in this system."
        : "Implemented, not configured. Narration needs ELEVENLABS_API_KEY in the server environment.",
    },
    {
      id: "render",
      label: "Server-side rendering (Remotion)",
      configured: isRenderConfigured(),
      status: isRenderConfigured() ? "CONFIGURED" : "NOT CONFIGURED",
      detail: isRenderConfigured()
        ? "Implemented and enabled for this runtime. Renders run in the background worker path, never inside a page request."
        : "Implemented, not enabled. Set RENDER_ENABLED=true on a runtime with headless Chromium and FFmpeg.",
    },
    {
      id: "trigger",
      label: "Scheduled background work (Trigger.dev)",
      configured: analyticsSchedulingConnected(),
      status: analyticsSchedulingConnected() ? "CONNECTED" : "NOT CONNECTED",
      detail: analyticsSchedulingConnected()
        ? "A Trigger.dev project is configured; scheduled tasks can run."
        : "Task code is written and type-checked, but no Trigger.dev project is connected — nothing runs on a schedule. Manual paths work regardless.",
    },
    {
      id: "worker",
      label: "Trusted worker credential",
      configured: isWorkerConfigured(),
      status: isWorkerConfigured() ? "CONFIGURED" : "NOT CONFIGURED",
      detail: isWorkerConfigured()
        ? "The server credential for background writes is configured."
        : "SUPABASE_SECRET_KEY is not configured. Publishing, analytics sync, rendering and voice generation all need it.",
    },
  ];

  return (
    <DashboardShell
      title="Settings"
      pathname="/dashboard/settings"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Settings
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Your preferences, and the truth about what is configured. Secret
            values never appear here — only whether each one exists.
          </p>
        </div>

        <SectionCard
          title="Preferences"
          description="Defaults the studios and renderer read. Preferences, never credentials."
        >
          <SettingsForm
            defaults={defaults}
            voices={voices}
            voicesUnavailableReason={voicesUnavailableReason}
            voiceModels={VOICE_MODELS.map((model) => ({
              id: model.id,
              label: `${model.label} (up to ${model.maxCharacters.toLocaleString("en-GB")} characters per request)`,
            }))}
          />
        </SectionCard>

        <SectionCard
          title="Operational readiness"
          description="What is configured in this deployment. Code existing does not mean connected; connected does not mean live-verified."
        >
          <ul className="flex flex-col gap-2">
            {readiness.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-edge/70 bg-panel-raised/40 px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink-primary">
                    {entry.label}
                  </span>
                  <StatusBadge
                    tone={entry.configured ? "configured" : "inactive"}
                  >
                    {entry.status}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  {entry.detail}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title="Platform connections"
          description="OAuth connections live on Connected Accounts, with their permissions explained. This page does not duplicate them."
        >
          <Link
            href={CONNECTED_ACCOUNTS_PATH}
            className="inline-flex w-fit items-center rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            Open Connected Accounts
          </Link>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
