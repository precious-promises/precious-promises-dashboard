import { Clapperboard, Film } from "lucide-react";
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
import { describeRenderCapability } from "@/lib/video/render";
import { formatDuration } from "@/lib/video/scenes";
import { listVideoProjects } from "@/lib/video/repository";
import {
  ASPECT_RATIO_LABELS,
  VIDEO_PROJECT_STATUS_LABELS,
} from "@/lib/video/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Video Creation Studio · Precious Promises",
  robots: { index: false, follow: false },
};

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

  return (
    <DashboardShell
      title="Video Creation Studio"
      pathname="/dashboard/video"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Video Creation Studio
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-secondary">
            Build a composition from a content item: Scripture, explanation,
            declaration, prayer, branding and outro, in the order you choose.
          </p>
        </div>

        <div className="rounded-xl border border-edge bg-panel-raised/30 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-ink-primary">
              <Film aria-hidden="true" className="size-4 text-ink-muted" />
              Server rendering
            </span>
            <StatusBadge tone="inactive">
              {capability.connected ? "Connected" : "Not connected"}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-ink-muted">{capability.detail}</p>
        </div>

        {items.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={Clapperboard}
              title="No content to build a video from yet."
              description="A video project is always created from a content item, so its Scripture comes from the verified record."
              action={
                <Link
                  href="/dashboard/content/new"
                  className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                >
                  Create Content
                </Link>
              }
            />
          </div>
        ) : (
          <SectionCard
            title="New project"
            description="Choose the content item this video is built from, and the format it will be published in."
          >
            <ProjectCreateForm items={items} />
          </SectionCard>
        )}

        <SectionCard
          title="Projects"
          description={
            projects.length === 0
              ? "Nothing built yet."
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"}.`
          }
        >
          {projects.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No video projects yet. Create one above to open the editor.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/dashboard/video/${project.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge/70 bg-panel-raised/30 px-3.5 py-3 transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-primary">
                        {project.name}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {ASPECT_RATIO_LABELS[project.aspect_ratio]} ·{" "}
                        {formatDuration(project.duration_estimate_seconds)}{" "}
                        estimated · revision {project.current_revision}
                      </span>
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
