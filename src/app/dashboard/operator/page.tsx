import {
  Bot,
  CheckCircle2,
  Clock3,
  FileWarning,
  Play,
  Settings2,
  Sparkles,
  Video,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  runOperatorNow,
  saveOperatorPreferences,
} from "@/app/dashboard/operator/actions";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isWorkerConfigured } from "@/lib/supabase/worker";

export const metadata: Metadata = {
  title: "Operator Mode · Precious Promises",
  robots: { index: false, follow: false },
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function noticeText(value: string | null): string | null {
  switch (value) {
    case "settings-saved":
      return "Operator Mode settings saved.";
    case "settings-failed":
      return "The Operator Mode settings could not be saved.";
    case "run-completed":
      return "Operator Mode completed a pass. Review the Needs You section.";
    case "run-failed":
      return "The last Operator Mode pass failed. See Recent Runs for evidence.";
    case "worker-not-configured":
      return "The trusted worker credential is not configured, so Operator Mode cannot run yet.";
    case "disabled":
      return "Operator Mode is disabled. Enable it before running a pass.";
    default:
      return null;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OperatorPage(
  props: PageProps<"/dashboard/operator">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(LOGIN_PATH);

  const searchParams = await props.searchParams;
  const notice = noticeText(firstParam(searchParams.notice));

  const [
    settingsResult,
    runsResult,
    aiDraftsResult,
    scriptureResult,
    approvalResult,
    scheduleResult,
  ] = await Promise.all([
    supabase
      .from("app_settings")
      .select(
        "automation_enabled, automation_create_working_drafts, automation_prepare_video_drafts, automation_submit_for_review, automation_last_run_at, automation_last_error",
      )
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("automation_runs")
      .select("id, status, started_at, completed_at, summary, error_detail")
      .eq("owner_id", user.id)
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("ai_generations")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("status", "drafted"),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .in("scripture_verification_status", [
        "unverified",
        "verification_required",
      ])
      .not("scripture_reference", "is", null),
    supabase
      .from("platform_variants")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("review_state", "ready_for_review"),
    supabase
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("status", "scheduled"),
  ]);

  const settings = settingsResult.data as {
    automation_enabled: boolean;
    automation_create_working_drafts: boolean;
    automation_prepare_video_drafts: boolean;
    automation_submit_for_review: boolean;
    automation_last_run_at: string | null;
    automation_last_error: string | null;
  } | null;

  const enabled = settings?.automation_enabled ?? false;
  const workerReady = isWorkerConfigured();
  const runs = (runsResult.data ?? []) as {
    id: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    summary: Record<string, unknown>;
    error_detail: string | null;
  }[];

  return (
    <DashboardShell
      title="Operator Mode"
      pathname="/dashboard/operator"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] px-5 py-6 shadow-[0_30px_90px_rgba(0,0,0,0.34)] sm:px-7 lg:px-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.28),transparent_34%),radial-gradient(circle_at_88%_5%,rgba(201,169,97,0.12),transparent_30%)]"
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Bot aria-hidden="true" className="size-4" />
                Automated command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl">
                Let the system do the repetitive work
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Operator Mode prepares drafts, platform variants and video
                structure from your saved content. It stops at human decision
                points: Scripture verification and final approval remain yours.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={enabled ? "configured" : "inactive"}>
                {enabled ? "ENABLED" : "DISABLED"}
              </StatusBadge>
              <StatusBadge tone={workerReady ? "configured" : "inactive"}>
                {workerReady ? "WORKER READY" : "WORKER NOT READY"}
              </StatusBadge>
            </div>
          </div>
        </section>

        {notice ? (
          <div
            role="status"
            className="rounded-xl border border-edge/80 bg-panel-raised/45 px-4 py-3 text-sm text-ink-secondary"
          >
            {notice}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "AI drafts awaiting you",
              value: aiDraftsResult.count ?? 0,
              icon: Sparkles,
              href: "/dashboard/scripts",
            },
            {
              label: "Scripture checks",
              value: scriptureResult.count ?? 0,
              icon: FileWarning,
              href: "/dashboard/scripture",
            },
            {
              label: "Approval decisions",
              value: approvalResult.count ?? 0,
              icon: CheckCircle2,
              href: "/dashboard/approvals",
            },
            {
              label: "Scheduled posts",
              value: scheduleResult.count ?? 0,
              icon: Clock3,
              href: "/dashboard/calendar",
            },
          ].map(({ label, value, icon: Icon, href }) => (
            <Link
              key={label}
              href={href}
              className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-4 transition hover:border-edge-strong hover:bg-white/[0.035]"
            >
              <div className="flex items-center justify-between gap-3">
                <Icon aria-hidden="true" className="size-4 text-[#bda7ff]" />
                <span className="text-2xl font-semibold tabular-nums text-ink-primary">
                  {value}
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {label}
              </p>
            </Link>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-5">
            <div className="flex items-start gap-3">
              <Settings2
                aria-hidden="true"
                className="mt-0.5 size-5 text-[#bda7ff]"
              />
              <div>
                <h3 className="text-base font-semibold text-ink-primary">
                  Automation controls
                </h3>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Nothing publishes merely because these switches are on.
                  Approval and platform evidence stay separate.
                </p>
              </div>
            </div>

            <form action={saveOperatorPreferences} className="mt-5 space-y-3">
              {[
                {
                  name: "automation_enabled",
                  label: "Enable Operator Mode",
                  detail: "Allow manual and scheduled automation passes.",
                  checked: enabled,
                },
                {
                  name: "automation_create_working_drafts",
                  label: "Prepare working drafts",
                  detail:
                    "Create missing platform variants and AI draft suggestions.",
                  checked: settings?.automation_create_working_drafts ?? true,
                },
                {
                  name: "automation_prepare_video_drafts",
                  label: "Prepare video structure",
                  detail:
                    "Create a draft project and safe scene structure after a script revision exists.",
                  checked: settings?.automation_prepare_video_drafts ?? true,
                },
                {
                  name: "automation_submit_for_review",
                  label: "Move completed copy to review",
                  detail:
                    "When saved variant copy exists, move it to Ready for Review. This is not approval.",
                  checked: settings?.automation_submit_for_review ?? true,
                },
              ].map((option) => (
                <label
                  key={option.name}
                  className="flex cursor-pointer gap-3 rounded-xl border border-edge/70 bg-white/[0.018] px-4 py-3"
                >
                  <input
                    type="checkbox"
                    name={option.name}
                    defaultChecked={option.checked}
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-primary">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-ink-muted">
                      {option.detail}
                    </span>
                  </span>
                </label>
              ))}
              <button
                type="submit"
                className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Save automation settings
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-5">
            <div className="flex items-start gap-3">
              <Play aria-hidden="true" className="mt-0.5 size-5 text-gold" />
              <div>
                <h3 className="text-base font-semibold text-ink-primary">
                  Run control
                </h3>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Last run:{" "}
                  {formatDate(settings?.automation_last_run_at ?? null)}
                </p>
              </div>
            </div>

            {settings?.automation_last_error ? (
              <p className="mt-4 rounded-xl border border-red-900/45 bg-red-950/30 px-3 py-2.5 text-xs leading-5 text-red-200">
                {settings.automation_last_error}
              </p>
            ) : null}

            <form action={runOperatorNow} className="mt-5">
              <button
                type="submit"
                disabled={!enabled || !workerReady}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#080b12] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play aria-hidden="true" className="size-4" />
                Run Operator now
              </button>
            </form>

            <div className="mt-5 space-y-2 text-xs leading-5 text-ink-muted">
              <p>Operator Mode may create draft work and workflow structure.</p>
              <p>It never marks Scripture verified.</p>
              <p>It never approves content on your behalf.</p>
              <p>It never treats scheduling as proof of publication.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-primary">
                Recent automation runs
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                Evidence of what the automation actually did.
              </p>
            </div>
            <Link
              href="/dashboard/production"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#bda7ff]"
            >
              <Video aria-hidden="true" className="size-4" />
              Production Board
            </Link>
          </div>

          {runs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-edge px-4 py-6 text-sm text-ink-muted">
              No Operator Mode runs are recorded yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li
                  key={run.id}
                  className="rounded-xl border border-edge/70 bg-white/[0.018] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink-primary">
                        {formatDate(run.started_at)}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {JSON.stringify(run.summary)}
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        run.status === "completed"
                          ? "configured"
                          : run.status === "failed"
                            ? "inactive"
                            : "accent"
                      }
                    >
                      {run.status.replace(/_/g, " ").toUpperCase()}
                    </StatusBadge>
                  </div>
                  {run.error_detail ? (
                    <p className="mt-2 text-xs text-red-300">
                      {run.error_detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
