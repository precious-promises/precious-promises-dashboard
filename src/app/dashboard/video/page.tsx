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
  const draftCount = projects.filter((project) => project.status === "draft").length;
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.12),transparent_34%),linear-gradient(135deg,rgba(30,22,58,0.96),rgba(17,15,31,0.98))] px-5 py-6 shadow-xl sm:px-7 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-highlight-soft">
                <Film aria-hidden="true" className="size-4" />
                Visual production command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Video Creation Studio
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Turn a content item into a structured video project with
                Scripture, teaching, declarations, prayer, branding, media,
                timing and a browser preview — while keeping authoring, rendering,
                approval and publication as separate evidence states.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/media"
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Media Assets
              </Link>
              <Link
                href="/dashboard/approvals"
                className="rounded-xl bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Approval Queue
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Video studio metrics"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <Metric
            label="Projects"
            value={projects.length}
            detail="Real video project records"
          />
          <Metric
            label="Draft"
            value={draftCount}
            detail="Still being authored"
          />
          <Metric
            label="Ready for review"
            value={reviewCount}
            detail="Authoring state only"
          />
          <Metric
            label="Archived"
            value={archivedCount}
            detail="Retained project history"
          />
          <Metric
            label="Render path"
            value={capability.connected ? "Connected" : "Not connected"}
            detail="Runtime capability, not render success"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
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
                ["1", "Compose", "Scenes, order, timing and transitions"],
                ["2", "Preview", "Browser layout and timing — not a render"],
                ["3", "Render", "A worker must genuinely produce the file"],
                ["4", "Review", "Approval and publishing remain separate"],
              ].map(([step, title, detail]) => (
                <div
                  key={step}
                  className="rounded-xl border border-edge/70 bg-panel/40 px-4 py-4"
                >
                  <span className="text-xs font-semibold text-highlight">{step}</span>
                  <p className="mt-2 text-sm font-semibold text-ink-primary">
                    {title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <Film aria-hidden="true" className="size-4 text-ink-muted" />
                Server rendering
              </span>
              <StatusBadge tone={capability.connected ? "configured" : "inactive"}>
                {capability.connected ? "Connected" : "Not connected"}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {capability.detail}
            </p>
            <p className="mt-3 border-t border-edge/70 pt-3 text-xs leading-5 text-ink-secondary">
              A configured or connected render path is not proof that any project
              has rendered. Completion requires a genuine output asset on the
              render job.
            </p>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
            <EmptyState
              icon={Clapperboard}
              title="No content to build a video from yet."
              description="A video project is always created from a content item, so its Scripture comes from the source record rather than being retyped in the video editor."
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
            title="Start a video project"
            description="Choose the source content item and intended format. Creating a project creates an editable composition record; it does not render, approve, schedule or publish anything."
          >
            <ProjectCreateForm items={items} />
          </SectionCard>
        )}

        <SectionCard
          title="Video projects"
          description={
            projects.length === 0
              ? "No project records yet."
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"} in the studio.`
          }
        >
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-edge px-4 py-6 text-center">
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
                    className="group flex h-full flex-col rounded-2xl border border-edge/80 bg-panel-raised/30 px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:bg-panel-hover/60 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-edge/70 bg-panel/60 text-ink-secondary">
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
                          {formatDuration(project.duration_estimate_seconds)} estimated
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-muted">Revision</p>
                        <p className="mt-1 font-medium text-ink-secondary">
                          {project.current_revision}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-xs font-semibold text-highlight">
                      Open production editor →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <section className="rounded-2xl border border-edge bg-panel-raised/25 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Video truth boundary
          </p>
          <div className="mt-3 grid gap-3 text-xs leading-5 text-ink-secondary md:grid-cols-2 xl:grid-cols-4">
            <p>
              <strong className="text-ink-primary">Preview ≠ render.</strong>{" "}
              The browser preview shows composition and timing but produces no
              encoded video file.
            </p>
            <p>
              <strong className="text-ink-primary">Render ≠ approval.</strong>{" "}
              A genuine output file is production evidence, not permission to
              publish it.
            </p>
            <p>
              <strong className="text-ink-primary">Approval ≠ publication.</strong>{" "}
              Scheduling, provider confirmation and public watchability remain
              separate states elsewhere in the dashboard.
            </p>
            <p>
              <strong className="text-ink-primary">Scripture ≠ authored prose.</strong>{" "}
              Scripture scenes reference the stored verse; declarations, prayer
              and teaching remain visibly distinct authored content.
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
