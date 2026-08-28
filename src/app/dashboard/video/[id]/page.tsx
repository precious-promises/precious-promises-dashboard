import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Film,
  Layers3,
  PackageCheck,
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

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-edge/80 bg-panel-raised/40 px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink-primary">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-ink-muted">{detail}</p>
    </div>
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
  const completedRenders = jobs.filter(
    (job) => job.status === "completed",
  ).length;
  const activeRenders = jobs.filter(
    (job) => job.status === "queued" || job.status === "rendering",
  ).length;

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
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard/video"
            className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All video projects
          </Link>
          {notice && NOTICES[notice] ? (
            <p
              role="status"
              className="rounded-xl border border-edge-strong/70 bg-panel-raised/60 px-3 py-2 text-xs leading-5 text-ink-secondary"
            >
              {NOTICES[notice]}
            </p>
          ) : null}
        </div>

        <section className="relative overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,var(--color-panel-hover),transparent_42%),linear-gradient(135deg,var(--color-panel-raised),var(--color-panel))] p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-highlight">
                <Clapperboard aria-hidden="true" className="size-4" />
                Video composition workspace
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
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
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Arrange the composition, inspect every scene, attach real media
                records and request rendering without confusing any production
                state with approval or publication.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-ink-secondary">
              <span className="rounded-lg border border-edge bg-panel-raised/55 px-2.5 py-1.5">
                {ASPECT_RATIO_LABELS[project.aspect_ratio]}
              </span>
              <span className="rounded-lg border border-edge bg-panel-raised/55 px-2.5 py-1.5">
                Revision {project.current_revision}
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric
            label="Scenes"
            value={scenes.length}
            detail="Real timeline layers"
          />
          <Metric
            label="Duration"
            value={formatDuration(project.duration_estimate_seconds)}
            detail="Composition estimate"
          />
          <Metric
            label="Media Slots"
            value={assets.length}
            detail="Attached asset records"
          />
          <Metric
            label="Render Jobs"
            value={jobs.length}
            detail="Every request retained"
          />
          <Metric
            label="Active Renders"
            value={activeRenders}
            detail="Queued or rendering"
          />
          <Metric
            label="Completed Files"
            value={completedRenders}
            detail="Jobs with completed evidence"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="pp-glass rounded-2xl border border-edge px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center gap-2">
              <Film aria-hidden="true" className="size-4 text-highlight" />
              <h3 className="text-sm font-semibold text-ink-primary">
                Project settings
              </h3>
            </div>
            <ProjectSettingsForm project={project} />
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-highlight"
              />
              <h3 className="text-sm font-semibold text-ink-primary">
                Evidence boundary
              </h3>
            </div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-ink-secondary">
              <p>Browser preview is not a rendered file.</p>
              <p>
                A completed render is not approval, scheduling or publication.
              </p>
              <p>
                Scripture is referenced from the content record; authored prose
                stays separate from Scripture.
              </p>
            </div>
          </div>
        </section>

        {/* Mobile: a management view, not a shrunken editor. */}
        <div className="lg:hidden">
          <div className="pp-glass rounded-2xl border border-edge px-4 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Layers3 aria-hidden="true" className="size-4 text-highlight" />
              <h3 className="text-sm font-semibold text-ink-primary">
                Mobile production view
              </h3>
            </div>
            <MobileProjectView
              project={project}
              scenes={scenes}
              assets={assets}
            />
          </div>
        </div>

        {/* Laptop and up: the four-region editor. */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(280px,340px)]">
          <div className="flex flex-col gap-4">
            <SectionCard title="Layers" headingLevel={3}>
              <LayerPanel projectId={project.id} />
            </SectionCard>

            <SectionCard
              title="Scripture source"
              description="Read-only. A Scripture scene references this record rather than copying its words."
              headingLevel={3}
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
              title="Media slots"
              description={`${mediaAssets.length} media ${mediaAssets.length === 1 ? "asset is" : "assets are"} available in the library.`}
              headingLevel={3}
            >
              <AssetSlots
                projectId={project.id}
                assets={assets}
                mediaAssets={mediaAssets}
              />
            </SectionCard>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard
              title="Preview"
              description="Layout and timing in your browser. Not a render."
              headingLevel={3}
            >
              <div className="mx-auto w-full max-w-md">
                <PreviewPlayer
                  scenes={preview}
                  aspectRatio={project.aspect_ratio}
                  backgroundSceneIds={backgroundSceneIds}
                  initialIndex={selectedIndex}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Timeline"
              description={`${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"} · ${formatDuration(project.duration_estimate_seconds)} estimated composition length.`}
              headingLevel={3}
            >
              <Timeline
                projectId={project.id}
                scenes={scenes}
                assets={assets}
                selectedSceneId={selected?.id ?? null}
              />
            </SectionCard>
          </div>

          <div className="flex flex-col gap-4">
            <SectionCard
              title="Scene inspector"
              description={
                selected
                  ? `Scene ${selected.scene_order} of ${scenes.length}.`
                  : "Nothing selected."
              }
              headingLevel={3}
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
                <p className="text-sm text-ink-muted">
                  Add a layer to start building this video.
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Render evidence"
              description="Requests and outcomes are retained. Completion requires a real output asset."
              headingLevel={3}
            >
              <RenderPanel projectId={project.id} jobs={jobs} />
            </SectionCard>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-edge/80 bg-panel-raised/30 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <Layers3 aria-hidden="true" className="size-4 text-highlight" />
              Composition
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Scenes, timing, transitions and media assignments describe what
              should be rendered. They are authoring evidence only.
            </p>
          </div>
          <div className="rounded-2xl border border-edge/80 bg-panel-raised/30 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <Clock3 aria-hidden="true" className="size-4 text-highlight" />
              Render lifecycle
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Queued, rendering, completed, failed and cancelled are render-job
              states. They do not describe platform publication.
            </p>
          </div>
          <div className="rounded-2xl border border-edge/80 bg-panel-raised/30 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
              <PackageCheck
                aria-hidden="true"
                className="size-4 text-highlight"
              />
              Completed output
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              A completed job requires output-media evidence. That file still
              needs separate review, approval, scheduling and publication steps.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
