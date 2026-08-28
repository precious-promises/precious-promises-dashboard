import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Film,
  Layers3,
  MonitorPlay,
} from "lucide-react";
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-edge bg-[radial-gradient(circle_at_top_right,var(--color-panel-hover),transparent_42%),linear-gradient(135deg,var(--color-panel-raised),var(--color-panel))] px-5 py-6 shadow-sm sm:px-7 sm:py-8">
          <div className="relative z-10 max-w-3xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-highlight">
              <Clapperboard aria-hidden="true" className="size-4" />
              Composition command centre
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
              Video Creation Studio
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
              Turn a content item into a structured video composition with
              Scripture, teaching, declarations, prayer, branding, media and
              timing kept in their proper roles.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/dashboard/media"
                className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-panel-raised/70 px-3.5 py-2 text-sm font-medium text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Media Assets
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <Link
                href="/dashboard/approvals"
                className="inline-flex items-center gap-2 rounded-xl border border-edge/80 px-3.5 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Approval Queue
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Projects"
            value={projects.length}
            detail="Real saved video projects"
          />
          <Metric
            label="Draft"
            value={draftCount}
            detail="Still being authored"
          />
          <Metric
            label="Ready for Review"
            value={reviewCount}
            detail="Authoring state only"
          />
          <Metric
            label="Archived"
            value={archivedCount}
            detail="Retained project history"
          />
          <Metric
            label="Content Sources"
            value={items.length}
            detail="Items available to start from"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-2xl border border-edge bg-panel/70 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-edge bg-panel-raised/60 p-2.5">
                <MonitorPlay
                  aria-hidden="true"
                  className="size-5 text-highlight"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.13em] text-ink-muted">
                      Render capability
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-ink-primary">
                      Server rendering
                    </h3>
                  </div>
                  <StatusBadge
                    tone={capability.connected ? "configured" : "inactive"}
                  >
                    {capability.connected
                      ? "Available in runtime"
                      : "Not connected"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">
                  {capability.detail}
                </p>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  A renderer existing in code does not prove a deployed worker,
                  a completed file, approval, scheduling or publication.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-edge bg-panel-raised/35 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-highlight"
              />
              <h3 className="text-sm font-semibold text-ink-primary">
                Composition truth
              </h3>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-secondary">
              Browser preview is not a render. A completed render is not an
              approval. Approval is not scheduling, and scheduling is not
              publication.
            </p>
          </div>
        </section>

        {items.length === 0 ? (
          <div className="pp-glass rounded-2xl border border-edge">
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
            title="Start a video project"
            description="Choose the source content and intended frame. The project remains an authoring record until later evidence proves anything more."
          >
            <ProjectCreateForm items={items} />
          </SectionCard>
        )}

        <SectionCard
          title="Production projects"
          description={
            projects.length === 0
              ? "Nothing built yet."
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"} recorded in the studio.`
          }
        >
          {projects.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No video projects yet. Create one above to open the editor.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/dashboard/video/${project.id}`}
                    className="group flex h-full flex-col justify-between rounded-2xl border border-edge/80 bg-panel-raised/35 p-4 transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-xl border border-edge/70 bg-panel/70 p-2">
                          <Layers3
                            aria-hidden="true"
                            className="size-4 text-ink-muted"
                          />
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
                      <h3 className="mt-4 text-base font-semibold text-ink-primary">
                        {project.name}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-ink-muted">
                        {ASPECT_RATIO_LABELS[project.aspect_ratio]} ·{" "}
                        {formatDuration(project.duration_estimate_seconds)}{" "}
                        estimated
                      </p>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-edge/60 pt-3 text-xs text-ink-secondary">
                      <span>Revision {project.current_revision}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-ink-primary">
                        Open editor
                        <ArrowRight
                          aria-hidden="true"
                          className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="rounded-2xl border border-edge/80 bg-panel-raised/25 px-4 py-3">
          <div className="flex items-start gap-2">
            <Film
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-ink-muted"
            />
            <p className="text-xs leading-5 text-ink-muted">
              Scripture scenes reference the stored Scripture record and cannot
              hold an editable copy. Explanation, declaration, prayer and outro
              remain authored prose and must never be presented as Scripture.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
