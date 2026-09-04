import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CONNECTED_ACCOUNTS_PATH } from "@/config/navigation";
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

export const metadata: Metadata = {
  title: "Settings · Precious Promises",
  robots: { index: false, follow: false },
};

function OverviewMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/45 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

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
  const aiConfigured = isAiConfigured();
  const renderConfigured = isRenderConfigured();
  const triggerConnected = analyticsSchedulingConnected();
  const workerConfigured = isWorkerConfigured();

  const readiness: ReadinessEntry[] = [
    {
      id: "ai",
      label: "AI assistance (Anthropic)",
      configured: aiConfigured,
      status: aiConfigured ? "CONFIGURED" : "NOT CONFIGURED",
      detail: aiConfigured
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
      configured: renderConfigured,
      status: renderConfigured ? "CONFIGURED" : "NOT CONFIGURED",
      detail: renderConfigured
        ? "Implemented and enabled for this runtime. Renders run in the background worker path, never inside a page request."
        : "Implemented, not enabled. Set RENDER_ENABLED=true on a runtime with headless Chromium and FFmpeg.",
    },
    {
      id: "trigger",
      label: "Scheduled background work (Trigger.dev)",
      configured: triggerConnected,
      status: triggerConnected ? "CONNECTED" : "NOT CONNECTED",
      detail: triggerConnected
        ? "A Trigger.dev project is configured; scheduled tasks can run."
        : "Task code is written and type-checked, but no Trigger.dev project is connected — nothing runs on a schedule. Manual paths work regardless.",
    },
    {
      id: "worker",
      label: "Trusted worker credential",
      configured: workerConfigured,
      status: workerConfigured ? "CONFIGURED" : "NOT CONFIGURED",
      detail: workerConfigured
        ? "The server credential for background writes is configured."
        : "SUPABASE_SECRET_KEY is not configured. Publishing, analytics sync, rendering and voice generation all need it.",
    },
  ];

  const configuredCount = readiness.filter((entry) => entry.configured).length;
  const incompleteCount = readiness.length - configuredCount;
  const voiceState = !elevenLabsConfigured
    ? "Not configured"
    : voices !== null
      ? `${voices.length} available`
      : "List unavailable";

  return (
    <DashboardShell
      title="Settings"
      pathname="/dashboard/settings"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.13),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <Settings2 aria-hidden="true" className="size-4" />
                System control centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Settings
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Control the defaults used across Precious Promises and inspect
                the deployment signals the system can actually prove. This page
                separates saved preferences, configured services and external
                connections so operational state is never overstated.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-white/65">
              <div className="flex items-center gap-2 font-semibold text-white">
                <ShieldCheck aria-hidden="true" className="size-4" />
                Credential boundary
              </div>
              <p className="mt-1 max-w-xs">
                Credentials stay server-side. This surface exposes only
                configuration state and owner preferences, never credential
                values.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Settings overview"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <OverviewMetric
            label="Readiness signals"
            value={readiness.length}
            detail="Deployment checks represented here"
          />
          <OverviewMetric
            label="Positive signals"
            value={configuredCount}
            detail="Configured or connected states reported"
          />
          <OverviewMetric
            label="Needs setup"
            value={incompleteCount}
            detail="Signals not currently configured or connected"
          />
          <OverviewMetric
            label="Default format"
            value={defaults.default_aspect_ratio}
            detail="Saved or effective video aspect ratio"
          />
          <OverviewMetric
            label="Voice account"
            value={voiceState}
            detail="ElevenLabs listing state observed now"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3">
              <SlidersHorizontal
                aria-hidden="true"
                className="mt-0.5 size-5 text-highlight"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Control model
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Preferences and infrastructure are deliberately separate
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                  Preferences below affect the defaults read by studios and
                  rendering workflows. Operational readiness beside them is
                  informational: it reports server-side configuration or a
                  known project connection, not a guarantee that an external
                  provider is healthy or that an action has succeeded.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Save", "Store owner defaults only"],
                ["2", "Configure", "Provide required server-side setup"],
                ["3", "Connect", "Authorise external platforms separately"],
                ["4", "Verify", "Confirm live behaviour through actual use"],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-panel/40 px-4 py-4"
                >
                  <span className="text-xs font-semibold text-highlight">
                    {step}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-ink-primary">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <div className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-4 text-highlight" />
              <p className="text-sm font-semibold text-ink-primary">
                System truth boundary
              </p>
            </div>
            <ul className="mt-4 space-y-3 text-xs leading-5 text-ink-muted">
              <li>Implemented ≠ configured.</li>
              <li>Configured ≠ connected.</li>
              <li>Connected ≠ authorised for every action.</li>
              <li>Authorised ≠ live-verified.</li>
              <li>Credential present ≠ provider healthy.</li>
              <li>Preference saved ≠ external action completed.</li>
            </ul>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
          <SectionCard
            title="Owner preferences"
            description="Defaults the studios and renderer read. Preferences only; never credentials."
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
            description="Server-side configuration and connection signals available to this deployment."
          >
            <ul className="flex flex-col gap-3">
              {readiness.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-edge/70 bg-panel-raised/40 px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border ${
                          entry.configured
                            ? "border-emerald-900/70 bg-emerald-950/40 text-emerald-300"
                            : "border-edge bg-panel text-ink-muted"
                        }`}
                      >
                        {entry.configured ? (
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                        ) : (
                          <Activity aria-hidden="true" className="size-4" />
                        )}
                      </div>
                      <span className="pt-1 text-sm font-medium text-ink-primary">
                        {entry.label}
                      </span>
                    </div>
                    <StatusBadge
                      tone={entry.configured ? "configured" : "inactive"}
                    >
                      {entry.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 pl-10 text-xs leading-5 text-ink-muted">
                    {entry.detail}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <SectionCard
          title="Platform connections"
          description="OAuth connections and platform permissions stay on Connected Accounts instead of being duplicated here."
        >
          <div className="flex flex-col gap-4 rounded-xl border border-edge/70 bg-panel-raised/35 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-ink-primary">
                Manage external account connections
              </p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">
                Review which platforms are connected and what permissions are
                recorded there. A connection record remains distinct from live
                publishing verification.
              </p>
            </div>
            <Link
              href={CONNECTED_ACCOUNTS_PATH}
              className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg border border-edge-strong bg-panel-raised/60 px-3.5 py-2 text-xs font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              Open Connected Accounts
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
