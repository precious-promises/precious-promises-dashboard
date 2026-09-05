import {
  Archive,
  CheckCircle2,
  Clapperboard,
  FileText,
  Film,
  Images,
  Music2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProjectCreateForm } from "@/components/video/project-create-form";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import { listContentItems } from "@/lib/content/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { describeRenderCapability } from "@/lib/video/render";
import { listVideoProjects } from "@/lib/video/repository";
import { formatDuration } from "@/lib/video/scenes";
import {
  ASPECT_RATIO_LABELS,
  VIDEO_PROJECT_STATUS_LABELS,
} from "@/lib/video/types";

export const metadata: Metadata = {
  title: "Video Creation Studio · Precious Promises",
  robots: { index: false, follow: false },
};

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  accent: "purple" | "gold" | "blue" | "green" | "neutral";
}) {
  const accentClasses = {
    purple: "border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]",
    gold: "border-gold-dim/35 bg-gold/10 text-gold",
    blue: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    neutral: "border-edge bg-white/[0.025] text-ink-secondary",
  } as const;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-edge/75 bg-[#0a0f1d]/90 p-4 shadow-[0_16px_45px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-edge-strong sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${accentClasses[accent]}`}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{detail}</p>
    </div>
  );
}

function ToolLink({
  href,
  title,
  detail,
  icon: Icon,
}: {
  href: string;
  title: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-28 flex-col rounded-2xl border border-edge/75 bg-[#0a0f1d]/82 p-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)] transition duration-200 hover:-translate-y-0.5 hover:border-[#7138dc]/40 hover:bg-[#0d1322]"
    >
      <span className="flex size-9 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
      </span>
      <span className="mt-3 text-sm font-semibold text-ink-primary">
        {title}
      </span>
      <span className="mt-1 text-xs leading-5 text-ink-muted">{detail}</span>
      <span className="mt-auto pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-soft transition group-hover:text-ink-primary">
        Open workspace →
      </span>
    </Link>
  );
}

/**
 * Video Creation Studio — project list.
 *
 * A project is always created from a content item, so the Scripture a video
 * shows is the verified record rather than something retyped here.
 */
export default async function VideoStudioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const [projects, items] = await Promise.all([
    listVideoProjects(),
    listContentItems(EMPTY_FILTERS),
  ]);
  const capability = describeRenderCapability();
  const draftCount = projects.filter(
    (project) => project.status === "draft",
  ).length;
  const reviewCount = projects.filter(
    (project) => project.status === "ready_for_review",
  ).length;
  const archivedCount = projects.filter(
    (project) => project.status === "archived",
  ).length;

  return (
    <DashboardShell
      title="Video Creation Studio"
      pathname="/dashboard/video"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.24),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.11),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Dedicated Visual Production Workspace
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Create video without crowding the dashboard
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                Build a structured video project with Scripture, authored copy,
                media, timing, browser preview and rendering controls in a
                dedicated production space. Calendar, analytics and daily
                overview controls stay outside this studio.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <a
                  href="#start-project"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  <Clapperboard aria-hidden="true" className="size-4" />
                  Start video project
                </a>
                <Link
                  href="/dashboard/media"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  <Images aria-hidden="true" className="size-4" />
                  Media assets
                </Link>
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[330px]">
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Projects
                </p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-ink-primary">
                  {projects.length}
                </p>
              </div>
              <div className="rounded-2xl border border-edge/75 bg-black/15 px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Render path
                </p>
                <p className="mt-1.5 text-sm font-semibold text-ink-primary">
                  {capability.connected ? "Connected" : "Not connected"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Video studio metrics"
          className="grid grid-cols-2 gap-3 lg:grid-cols-5"
        >
          <Metric
            label="Projects"
            value={projects.length}
            detail="Real video project records"
            icon={Clapperboard}
            accent="purple"
          />
          <Metric
            label="Draft"
            value={draftCount}
            detail="Still being authored"
            icon={Film}
            accent="neutral"
          />
          <Metric
            label="Ready for review"
            value={reviewCount}
            detail="Authoring state only"
            icon={CheckCircle2}
            accent="green"
          />
          <Metric
            label="Archived"
            value={archivedCount}
            detail="Retained project history"
            icon={Archive}
            accent="gold"
          />
          <Metric
            label="Render path"
            value={capability.connected ? "Connected" : "Not connected"}
            detail="Runtime capability, not render success"
            icon={Film}
            accent="blue"
          />
        </section>

        <section aria-labelledby="video-toolkit-heading">
          <div className="mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
              Creation toolkit
            </p>
            <h3
              id="video-toolkit-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink-primary sm:text-2xl"
            >
              Specialist tools, kept out of the overview
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ToolLink
              href="/dashboard/captions"
              title="Caption Studio"
              detail="Prepare platform-specific caption and metadata variants for review."
              icon={FileText}
            />
            <ToolLink
              href="/dashboard/media"
              title="Media & audio assets"
              detail="Work with image, video and audio asset records for production."
              icon={Music2}
            />
            <ToolLink
              href="/dashboard/approvals"
              title="Approval Queue"
              detail="Human review stays separate from authoring and rendering."
              icon={ShieldCheck}
            />
            <ToolLink
              href="/dashboard/production"
              title="Production Board"
              detail="See where each content item genuinely sits in the wider workflow."
              icon={Film}
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 px-5 py-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)] sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Production model
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-primary">
                  Build the composition before the file
                </h3>
              </div>
              <StatusBadge tone="configured">Editor implemented</StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["01", "Compose", "Scenes, order, timing and transitions"],
                ["02", "Preview", "Browser layout and timing — not a render"],
                ["03", "Render", "A worker must genuinely produce the file"],
                ["04", "Review", "Approval and publishing remain separate"],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-black/15 px-4 py-4"
                >
                  <span className="text-[10px] font-semibold tracking-[0.12em] text-[#bda7ff]">
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

          <div className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 px-5 py-5 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <Film aria-hidden="true" className="size-4 text-ink-muted" />
                Server rendering
              </span>
              <StatusBadge
                tone={capability.connected ? "configured" : "inactive"}
              >
                {capability.connected ? "Connected" : "Not connected"}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {capability.detail}
            </p>
            <p className="mt-3 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-secondary">
              A configured or connected render path is not proof that any
              project has rendered. Completion requires a genuine output asset
              on the render job.
            </p>
          </div>
        </section>

        <div id="start-project">
          {items.length === 0 ? (
            <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
              <EmptyState
                icon={Clapperboard}
                title="No content to build a video from yet."
                description="A video project is always created from a content item, so its Scripture comes from the source record rather than being retyped in the video editor."
                action={
                  <Link
                    href="/dashboard/content/new"
                    className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                  >
                    Create content
                  </Link>
                }
              />
            </section>
          ) : (
            <SectionCard
              title="Start a video project"
              description="Choose the source content item and intended format. Creating a project creates an editable composition record; it does not render, approve, schedule or publish anything."
              className="shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
            >
              <ProjectCreateForm items={items} />
            </SectionCard>
          )}
        </div>

        <SectionCard
          title="Video projects"
          description={
            projects.length === 0
              ? "No project records yet."
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"} in the studio.`
          }
          className="shadow-[0_20px_60px_rgba(0,0,0,0.22)]"
        >
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-edge/80 bg-black/10 px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink-secondary">
                No video projects yet.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Create one above to open the scene editor, preview and timeline.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/dashboard/video/${project.id}`}
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-edge/75 bg-[#090f1c]/85 px-4 py-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)] transition-all hover:-translate-y-0.5 hover:border-[#7138dc]/40 hover:bg-[#0c1322] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
                        <Clapperboard aria-hidden="true" className="size-4" />
                      </span>
                      <StatusBadge
                        tone={
                          project.status === "ready_for_review"
                            ? "accent"
                            : "inactive"
                        }
                      >
                        {VIDEO_PROJECT_STATUS_LABELS[project.status]}
                      </StatusBadge>
                    </div>

                    <div className="mt-4 min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink-primary group-hover:text-white">
                        {project.name}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {ASPECT_RATIO_LABELS[project.aspect_ratio]}
                      </p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2 border-t border-edge/70 pt-3 text-xs">
                      <div>
                        <p className="text-ink-muted">Timeline</p>
                        <p className="mt-1 font-medium text-ink-secondary">
                          {formatDuration(project.duration_estimate_seconds)}{" "}
                          estimated
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-muted">Revision</p>
                        <p className="mt-1 font-medium text-ink-secondary">
                          {project.current_revision}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-xs font-semibold text-highlight-soft">
                      Open production editor →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Video truth boundary
              </p>
              <div className="mt-2 grid gap-2 text-xs leading-5 text-ink-muted md:grid-cols-2 xl:grid-cols-4">
                <p>
                  <strong className="text-ink-secondary">
                    Preview ≠ render.
                  </strong>{" "}
                  Browser preview produces no encoded video file.
                </p>
                <p>
                  <strong className="text-ink-secondary">
                    Render ≠ approval.
                  </strong>{" "}
                  An output file is production evidence, not publishing
                  permission.
                </p>
                <p>
                  <strong className="text-ink-secondary">
                    Approval ≠ publication.
                  </strong>{" "}
                  Scheduling and public watchability remain separate states.
                </p>
                <p>
                  <strong className="text-ink-secondary">
                    Scripture ≠ authored prose.
                  </strong>{" "}
                  Scripture scenes reference the stored verse record.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
