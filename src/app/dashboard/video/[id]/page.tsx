import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ScriptureReadOnly } from "@/components/scripture/scripture-panel-readonly";
import { SectionCard } from "@/components/ui/section-card";
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
import { buildPreview } from "@/lib/video/preview";
import {
  getVideoProject,
  listProductionAssets,
  listRenderJobs,
  listScenes,
} from "@/lib/video/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard/video"
            className="text-sm text-ink-secondary underline underline-offset-2 transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
          >
            ← All video projects
          </Link>
          {notice && NOTICES[notice] ? (
            <p
              role="status"
              className="rounded-lg border border-edge-strong/70 bg-panel-raised/60 px-3 py-1.5 text-xs text-ink-secondary"
            >
              {NOTICES[notice]}
            </p>
          ) : null}
        </div>

        <div className="pp-glass rounded-xl border border-edge px-4 py-4">
          <ProjectSettingsForm project={project} />
        </div>

        {/* Mobile: a management view, not a shrunken editor. */}
        <div className="lg:hidden">
          <div className="pp-glass rounded-xl border border-edge px-4 py-4">
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

            <SectionCard title="Scripture" headingLevel={3}>
              {item ? (
                <ScriptureReadOnly item={item} />
              ) : (
                <p className="text-sm text-ink-muted">
                  The source content item is unavailable.
                </p>
              )}
            </SectionCard>

            <SectionCard title="Media slots" headingLevel={3}>
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

            <SectionCard title="Timeline" headingLevel={3}>
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
              title="Scene"
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

            <SectionCard title="Render" headingLevel={3}>
              <RenderPanel projectId={project.id} jobs={jobs} />
            </SectionCard>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
