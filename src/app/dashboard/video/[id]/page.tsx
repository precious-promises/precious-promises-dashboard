import {
  ArrowLeft,
  Clapperboard,
  Film,
  Images,
  MessageSquareQuote,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { AssetSlots } from "@/components/video/asset-slots";
import { LayerPanel } from "@/components/video/layer-panel";
import { MobileProjectView } from "@/components/video/mobile-project-view";
import { PreviewPlayer } from "@/components/video/preview-player";
import { ProjectSettingsForm } from "@/components/video/project-settings-form";
import { RenderPanel } from "@/components/video/render-panel";
import { SceneInspector } from "@/components/video/scene-inspector";
import { Timeline } from "@/components/video/timeline";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getContentItem } from "@/lib/content/repository";
import { listMediaAssets } from "@/lib/media/repository";
import { getLatestRevision } from "@/lib/scripts/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildPreview } from "@/lib/video/preview";
import {
  getVideoProject,
  listProductionAssets,
  listRenderJobs,
  listScenes,
} from "@/lib/video/repository";
import { formatDuration } from "@/lib/video/scenes";
import {
  ASPECT_RATIO_LABELS,
  VIDEO_PROJECT_STATUS_LABELS,
} from "@/lib/video/types";

export const metadata: Metadata = {
  title: "Video project · Precious Promises",
  robots: { index: false, follow: false },
};

/** Notices are set by the server actions, which redirect rather than return. */
const NOTICES: Record<string, string> = {
  "project-saved": "Project saved.",
  "project-invalid": "That project could not be saved. Check the name.",
  "scene-saved": "Scene saved.",
  "scene-invalid": "That scene could not be added.",
  "scene-too-short": "That scene is too short to split.",
  "slot-saved": "Media slot updated.",
  "slot-cleared": "Media slot cleared.",
  "slot-invalid": "That slot could not be saved.",
  "render-refused":
    "The render was refused and recorded as a failed request — nothing was rendered. The reason is on the job below.",
  "render-queued":
    "Render queued. It runs in the background worker path; nothing is marked completed unless the file genuinely exists.",
  "render-processed":
    "The render queue was processed. Each job's outcome is recorded below.",
  "render-reconciled":
    "Reconciled. If the output file existed it was recovered; otherwise the job is marked failed as a crash.",
  "render-cancelled":
    "Render cancelled. Future work stops; every record is kept.",
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.trim() !== "" ? raw : null;
}

function WorkspaceLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Film;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-edge/80 bg-white/[0.025] px-3 py-2 text-xs font-semibold text-ink-secondary transition hover:border-[#7138dc]/35 hover:bg-[#7138dc]/10 hover:text-ink-primary"
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Link>
  );
}

/**
 * The video editor.
 *
 * A specialist tool on its own page, not a panel on the dashboard. The four
 * regions — layers, preview, timeline, inspector — follow the locked Command
 * Centre direction in docs/design-system.md, built from the same shell and the
 * same tokens as every other surface.
 *
 * The selected scene lives in the URL rather than in client state, so the
 * whole editor renders on the server, survives a reload and can be linked to.
 */
export default async function VideoProjectPage(
  props: PageProps<"/dashboard/video/[id]">,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { id } = await props.params;
  const project = await getVideoProject(id);

  // A project belonging to somebody else is a 404, not a distinguishable
  // error, so responses cannot be used to discover which ids exist.
  if (!project) {
    notFound();
  }

  const searchParams = await props.searchParams;
  const notice = firstParam(searchParams.notice);

  const [scenes, assets, jobs, item, mediaAssets] = await Promise.all([
    listScenes(project.id),
    listProductionAssets(project.id),
    listRenderJobs(project.id),
    getContentItem(project.content_item_id),
    listMediaAssets(),
  ]);

  const script = await getLatestRevision(project.content_item_id);
  const preview = buildPreview(scenes, item, script);
  const backgroundSceneIds = scenes
    .filter((scene) => scene.media_asset_id !== null)
    .map((scene) => scene.id);

  const requestedSceneId = firstParam(searchParams.scene);
  const selectedIndex = Math.max(
    scenes.findIndex((scene) => scene.id === requestedSceneId),
    0,
  );
  const selected = scenes[selectedIndex] ?? null;

  return (
    <DashboardShell
      title={project.name}
      pathname="/dashboard/video"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1720px] flex-col gap-4">
        <section className="relative overflow-hidden rounded-[22px] border border-edge/80 bg-[#080d19] shadow-[0_24px_75px_rgba(0,0,0,0.3)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(112,55,221,0.2),transparent_32%),radial-gradient(circle_at_86%_0%,rgba(201,169,97,0.08),transparent_25%)]"
          />
          <div className="relative px-4 py-4 sm:px-5 lg:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <Link
                  href="/dashboard/video"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted transition hover:text-ink-primary"
                >
                  <ArrowLeft aria-hidden="true" className="size-3.5" />
                  Video projects
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/10 text-[#bda7ff]">
                    <Clapperboard aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-semibold tracking-[-0.025em] text-ink-primary sm:text-2xl">
                        {project.name}
                      </h2>
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
                    <p className="mt-1 text-xs text-ink-muted">
                      {ASPECT_RATIO_LABELS[project.aspect_ratio]} ·{" "}
                      {formatDuration(project.duration_estimate_seconds)}{" "}
                      estimated · Revision {project.current_revision}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <WorkspaceLink
                  href="/dashboard/captions"
                  label="Platform captions"
                  icon={MessageSquareQuote}
                />
                <WorkspaceLink
                  href="/dashboard/media"
                  label="Media & audio"
                  icon={Images}
                />
                <WorkspaceLink
                  href="/dashboard/approvals"
                  label="Review"
                  icon={ShieldCheck}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-xl">
              <div className="rounded-xl border border-edge/70 bg-black/15 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-muted">
                  Scenes
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink-primary">
                  {scenes.length}
                </p>
              </div>
              <div className="rounded-xl border border-edge/70 bg-black/15 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-muted">
                  Assets
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink-primary">
                  {assets.length}
                </p>
              </div>
              <div className="rounded-xl border border-edge/70 bg-black/15 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-muted">
                  Render jobs
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink-primary">
                  {jobs.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {notice && NOTICES[notice] ? (
          <p
            role="status"
            className="rounded-xl border border-[#7138dc]/25 bg-[#7138dc]/[0.07] px-4 py-3 text-xs leading-5 text-ink-secondary shadow-[0_12px_35px_rgba(0,0,0,0.14)] sm:text-sm"
          >
            {NOTICES[notice]}
          </p>
        ) : null}

        <details className="group overflow-hidden rounded-2xl border border-edge/80 bg-[#0a0f1d]/90 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold text-ink-primary sm:px-5">
            <span className="flex items-center gap-2">
              <Settings2 aria-hidden="true" className="size-4 text-[#bda7ff]" />
              Project settings
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted group-open:hidden">
              Expand
            </span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted group-open:inline">
              Collapse
            </span>
          </summary>
          <div className="border-t border-edge/70 px-4 py-4 sm:px-5">
            <ProjectSettingsForm project={project} />
          </div>
        </details>

        {/* Mobile: a management view, not a shrunken desktop timeline. */}
        <div className="lg:hidden">
          <section className="overflow-hidden rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
            <div className="border-b border-edge/70 px-4 py-3.5">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Mobile production view
              </div>
              <h3 className="mt-1 text-base font-semibold text-ink-primary">
                Manage the project without shrinking the desktop editor
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                The full timeline workspace remains a laptop/desktop tool.
                Mobile keeps the project controls readable and touch-friendly.
              </p>
            </div>
            <div className="px-4 py-4">
              <MobileProjectView
                project={project}
                scenes={scenes}
                assets={assets}
              />
            </div>
          </section>
        </div>

        {/* Laptop and up: dedicated editor with palette, canvas/timeline and inspector. */}
        <div className="hidden min-h-[760px] gap-3 lg:grid lg:grid-cols-[minmax(230px,270px)_minmax(0,1fr)_minmax(280px,330px)] xl:gap-4 xl:grid-cols-[minmax(250px,290px)_minmax(0,1fr)_minmax(300px,350px)]">
          <aside className="flex min-h-0 flex-col gap-3 xl:gap-4">
            <SectionCard
              title="Layers"
              description="Build the scene structure."
              headingLevel={3}
              className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
            >
              <LayerPanel projectId={project.id} />
            </SectionCard>

            <SectionCard
              title="Scripture"
              description="Read-only source text."
              headingLevel={3}
              className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
            >
              {item ? (
                <ScriptureReadOnly item={item} />
              ) : (
                <p className="text-sm text-ink-muted">
                  The source content item is unavailable.
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Media & audio slots"
              description="Attach recorded production assets."
              headingLevel={3}
              className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
            >
              <AssetSlots
                projectId={project.id}
                assets={assets}
                mediaAssets={mediaAssets}
              />
            </SectionCard>
          </aside>

          <main className="flex min-w-0 flex-col gap-3 xl:gap-4">
            <section className="relative overflow-hidden rounded-2xl border border-edge/80 bg-[#050811] shadow-[0_28px_80px_rgba(0,0,0,0.32)]">
              <div className="flex items-center justify-between gap-3 border-b border-edge/65 bg-[#090e1b]/90 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gold">
                    Preview canvas
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Browser layout and timing only — not a rendered file.
                  </p>
                </div>
                <StatusBadge tone="inactive">Preview</StatusBadge>
              </div>
              <div className="flex min-h-[460px] items-center justify-center bg-[radial-gradient(circle_at_center,rgba(112,55,221,0.08),transparent_50%)] p-5 xl:min-h-[540px] xl:p-7">
                <div className="w-full max-w-xl">
                  <PreviewPlayer
                    scenes={preview}
                    aspectRatio={project.aspect_ratio}
                    backgroundSceneIds={backgroundSceneIds}
                    initialIndex={selectedIndex}
                  />
                </div>
              </div>
            </section>

            <SectionCard
              title="Timeline"
              description="Scene order, timing and production assets."
              headingLevel={3}
              className="shadow-[0_22px_65px_rgba(0,0,0,0.24)]"
            >
              <Timeline
                projectId={project.id}
                scenes={scenes}
                assets={assets}
                selectedSceneId={selected?.id ?? null}
              />
            </SectionCard>
          </main>

          <aside className="flex min-h-0 flex-col gap-3 xl:gap-4">
            <SectionCard
              title="Scene inspector"
              description={
                selected
                  ? `Scene ${selected.scene_order} of ${scenes.length}.`
                  : "Nothing selected."
              }
              headingLevel={3}
              className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
            >
              {selected ? (
                <SceneInspector
                  projectId={project.id}
                  scene={selected}
                  mediaAssets={mediaAssets}
                  isFirst={selectedIndex === 0}
                  isLast={selectedIndex === scenes.length - 1}
                />
              ) : (
                <p className="rounded-xl border border-dashed border-edge/80 bg-black/10 px-3 py-5 text-center text-sm text-ink-muted">
                  Add a layer to start building this video.
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Render & output"
              description="A completed job needs a genuine output file."
              headingLevel={3}
              className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
            >
              <RenderPanel projectId={project.id} jobs={jobs} />
            </SectionCard>
          </aside>
        </div>

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">
                Editor truth boundary
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Preview is not render. A render is not approval. Approval is not
                publication. The Platform Captions shortcut opens the existing
                social-platform caption and metadata workflow; this editor does
                not claim automatic subtitle transcription unless that
                capability is implemented and verified separately.
              </p>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
