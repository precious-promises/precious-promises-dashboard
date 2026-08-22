import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Gauge,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  PipelinePanel,
  type PipelineJobView,
} from "@/components/production/pipeline-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LOGIN_PATH } from "@/lib/auth/routes";
import {
  CONTENT_TYPE_LABELS,
  SCRIPTURE_VERIFICATION_LABELS,
} from "@/lib/content/types";
import {
  groupByStage,
  loadBoard,
  type BoardCard,
} from "@/lib/production/board";
import {
  PIPELINE_HANDOFF_STATEMENT,
  type ProductionJob,
} from "@/lib/production/pipeline";
import {
  BOARD_STAGES,
  PRODUCTION_STAGE_LABELS,
  UNREACHABLE_STAGES,
} from "@/lib/production/stage";
import { formatInTimeZone } from "@/lib/schedule/timezone";
import { PLATFORM_LABELS, REVIEW_STATE_LABELS } from "@/lib/variants/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Production Board · Precious Promises",
  robots: { index: false, follow: false },
};

const STAGE_NOTES: Partial<Record<(typeof BOARD_STAGES)[number], string>> = {
  plan: "Content exists, but no later production signal has been reached yet.",
  verify_scripture: "Scripture needs checking before anything else proceeds.",
  write: "A script revision exists and the item remains in development.",
  produce: "A video composition exists and is being built.",
  review: "The item or a platform variant is ready for human review.",
  approve: "A valid approval exists and the content is waiting for scheduling.",
  schedule:
    "A time is set. Publishing still depends on the separate publish workflow.",
};

async function loadPipelineData(): Promise<{
  jobs: PipelineJobView[];
  contentOptions: { id: string; title: string }[];
}> {
  const supabase = await createSupabaseServerClient();

  const [{ data: jobRows }, { data: itemRows }] = await Promise.all([
    supabase
      .from("production_jobs")
      .select("*, content_items(title)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("content_items")
      .select("id, title")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  type JobRow = ProductionJob & { content_items: { title: string } | null };
  const jobs = (jobRows ?? []) as JobRow[];

  const projectIds = [
    ...new Set(
      jobs
        .map((job) => job.video_project_id)
        .filter((id): id is string => id !== null),
    ),
  ];
  const rendersByProject = new Map<string, { id: string; status: string }>();
  if (projectIds.length > 0) {
    const { data: renderRows } = await supabase
      .from("render_jobs")
      .select("id, status, video_project_id, created_at")
      .in("video_project_id", projectIds)
      .order("created_at", { ascending: false });
    for (const row of (renderRows ?? []) as {
      id: string;
      status: string;
      video_project_id: string;
    }[]) {
      if (!rendersByProject.has(row.video_project_id)) {
        rendersByProject.set(row.video_project_id, {
          id: row.id,
          status: row.status,
        });
      }
    }
  }

  return {
    jobs: jobs.map((row) => {
      const { content_items: contentItem, ...job } = row;
      return {
        job,
        contentTitle: contentItem?.title ?? "Untitled item",
        latestRender:
          job.video_project_id !== null
            ? (rendersByProject.get(job.video_project_id) ?? null)
            : null,
      };
    }),
    contentOptions: (itemRows ?? []) as { id: string; title: string }[],
  };
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="pp-glass rounded-2xl border border-edge p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.13em] text-ink-muted uppercase">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink-primary">
            {value}
          </p>
        </div>
        <span className="rounded-xl border border-edge bg-panel-hover/60 p-2.5 text-highlight">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-secondary">{description}</p>
    </div>
  );
}

function Card({ card }: { card: BoardCard }) {
  const scheduled = card.schedules.filter(
    (post) => post.status === "scheduled",
  );
  const paused = card.schedules.filter((post) => post.status === "paused");

  return (
    <li>
      <Link
        href={`/dashboard/content/${card.item.id}`}
        className="group block rounded-xl border border-edge/70 bg-panel-raised/45 px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-5 text-ink-primary">
              {card.item.title}
            </span>
            <span className="mt-1 block text-[11px] leading-4 text-ink-muted">
              {CONTENT_TYPE_LABELS[card.item.content_type]}
              {card.item.topic ? ` · ${card.item.topic}` : ""}
            </span>
          </span>
          <ArrowRight
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-highlight"
          />
        </span>

        {card.variants.length > 0 ? (
          <span className="mt-2.5 flex flex-wrap gap-1">
            {card.variants.map((variant) => (
              <StatusBadge
                key={variant.id}
                tone={
                  variant.review_state === "approved"
                    ? "configured"
                    : variant.review_state === "ready_for_review"
                      ? "accent"
                      : "inactive"
                }
              >
                {PLATFORM_LABELS[variant.platform]} ·{" "}
                {REVIEW_STATE_LABELS[variant.review_state]}
              </StatusBadge>
            ))}
          </span>
        ) : null}

        <span className="mt-2.5 block rounded-lg border border-edge/60 bg-panel/35 px-2.5 py-2 text-[11px] leading-5 text-ink-muted">
          Scripture:{" "}
          {card.item.scripture_reference
            ? SCRIPTURE_VERIFICATION_LABELS[
                card.item.scripture_verification_status
              ]
            : "None"}
          {" · "}
          Script:{" "}
          {card.latestScriptRevision
            ? `Revision ${card.latestScriptRevision}`
            : "None"}
          {" · "}
          Video: {card.hasVideo ? (card.videoStatus ?? "In progress") : "None"}
        </span>

        {card.staleApprovals > 0 ? (
          <span className="mt-2 block rounded-lg border border-gold-dim/50 bg-gold/10 px-2.5 py-1.5 text-[11px] leading-4 text-gold">
            {card.staleApprovals} approval
            {card.staleApprovals === 1 ? "" : "s"} withdrawn after a content
            change.
          </span>
        ) : null}

        {scheduled.length > 0 ? (
          <span className="mt-2 block text-[11px] font-medium text-ink-secondary">
            Scheduled{" "}
            {formatInTimeZone(
              new Date(scheduled[0]!.scheduled_for),
              scheduled[0]!.timezone,
            )}
          </span>
        ) : null}

        {paused.length > 0 ? (
          <span className="mt-1 block text-[11px] text-gold">
            Schedule paused: {paused[0]!.pause_reason}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default async function ProductionBoardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const [cards, pipeline] = await Promise.all([
    loadBoard(),
    loadPipelineData(),
  ]);
  const byStage = groupByStage(cards);
  const scriptureAttention = (byStage.get("verify_scripture") ?? []).length;
  const reviewReady = (byStage.get("review") ?? []).length;
  const approved = (byStage.get("approve") ?? []).length;
  const scheduled = (byStage.get("schedule") ?? []).length;
  const activePipelineJobs = pipeline.jobs.filter(
    ({ job }) =>
      job.status !== "ready_for_review" &&
      job.status !== "cancelled" &&
      job.status !== "failed",
  ).length;
  const failedPipelineJobs = pipeline.jobs.filter(
    ({ job }) => job.status === "failed",
  ).length;

  return (
    <DashboardShell
      title="Production Board"
      pathname="/dashboard/production"
      email={user.email ?? null}
    >
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6">
        <section className="relative overflow-hidden rounded-3xl border border-edge bg-panel px-5 py-6 shadow-sm sm:px-7 sm:py-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,var(--color-highlight-soft),transparent_68%)] opacity-20"
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-edge bg-panel-hover/70 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-ink-muted uppercase">
                <GitBranch aria-hidden="true" className="size-3.5 text-highlight" />
                Production command centre
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-primary sm:text-4xl">
                Production Board
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary sm:text-base">
                See where every content item genuinely sits based on Scripture,
                script, video, review, approval and scheduling records. Board
                position is derived from evidence rather than manually assigned.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/content"
                className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-panel-hover/50 px-4 py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:bg-panel-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Content Library
              </Link>
              <Link
                href="/dashboard/content/new"
                className="inline-flex items-center gap-2 rounded-xl bg-highlight px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
              >
                Create Content
              </Link>
            </div>
          </div>
        </section>

        <section
          aria-label="Production summary"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6"
        >
          <MetricCard
            label="In production"
            value={cards.length}
            description="Content items currently represented on the derived board."
            icon={Gauge}
          />
          <MetricCard
            label="Scripture attention"
            value={scriptureAttention}
            description="Items blocked until Scripture is verified again or confirmed."
            icon={CircleAlert}
          />
          <MetricCard
            label="Ready for review"
            value={reviewReady}
            description="Items that have genuinely reached the human review stage."
            icon={ShieldCheck}
          />
          <MetricCard
            label="Approved"
            value={approved}
            description="Items with a valid approval that still matches current content."
            icon={CheckCircle2}
          />
          <MetricCard
            label="Scheduled"
            value={scheduled}
            description="Approved content with an active schedule record."
            icon={CheckCircle2}
          />
          <MetricCard
            label="Active pipeline jobs"
            value={activePipelineJobs}
            description="Generation jobs still progressing before the review handoff."
            icon={GitBranch}
          />
        </section>

        {failedPipelineJobs > 0 ? (
          <section className="rounded-2xl border border-red-900/50 bg-red-950/25 px-4 py-3.5 sm:px-5">
            <div className="flex items-start gap-3">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-red-200"
              />
              <div>
                <h3 className="text-sm font-semibold text-red-100">
                  Pipeline attention required
                </h3>
                <p className="mt-1 text-xs leading-5 text-red-200/90">
                  {failedPipelineJobs} production job
                  {failedPipelineJobs === 1 ? " has" : "s have"} failed and will
                  not advance until explicitly retried or cancelled.
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="pp-glass overflow-hidden rounded-2xl border border-edge">
          <div className="border-b border-edge px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.13em] text-ink-muted uppercase">
                  Evidence-derived workflow
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight text-ink-primary">
                  Current production stages
                </h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-secondary">
                  Cards move only when the underlying records change. There is no
                  drag-and-drop shortcut that can bypass Scripture verification,
                  review, approval or scheduling requirements.
                </p>
              </div>
              <p className="text-xs text-ink-muted">
                {cards.length} {cards.length === 1 ? "content item" : "content items"}
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {cards.length === 0 ? (
              <EmptyState
                icon={Gauge}
                title="Nothing in production yet."
                description="Create a content item and it will appear here in the stage its records genuinely support."
                action={
                  <Link
                    href="/dashboard/content/new"
                    className="rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
                  >
                    Create Content
                  </Link>
                }
              />
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {BOARD_STAGES.map((stage) => {
                  const stageCards = byStage.get(stage) ?? [];
                  return (
                    <section
                      key={stage}
                      className="flex w-80 shrink-0 flex-col rounded-2xl border border-edge bg-panel/55"
                    >
                      <div className="border-b border-edge/70 px-4 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-ink-primary">
                            {PRODUCTION_STAGE_LABELS[stage]}
                          </h4>
                          <span className="flex size-7 items-center justify-center rounded-full border border-edge bg-panel-hover/60 text-xs font-semibold text-ink-secondary">
                            {stageCards.length}
                          </span>
                        </div>
                        <p className="mt-1.5 min-h-8 text-[11px] leading-4 text-ink-muted">
                          {STAGE_NOTES[stage]}
                        </p>
                      </div>

                      <div className="min-h-24 px-3 py-3">
                        {stageCards.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-edge px-3 py-5 text-center text-xs text-ink-muted">
                            Nothing here.
                          </div>
                        ) : (
                          <ul className="flex flex-col gap-2.5">
                            {stageCards.map((card) => (
                              <Card key={card.item.id} card={card} />
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-edge bg-panel/55 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-highlight" />
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Production truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                {UNREACHABLE_STAGES.map(
                  (stage) => PRODUCTION_STAGE_LABELS[stage],
                ).join(", ")} is not a board column. Publishing reports through
                the separate Publish Queue, which preserves per-platform attempts
                and outcomes instead of flattening them into a card position.
              </p>
            </div>
          </div>
        </section>

        <SectionCard
          title="Production pipeline"
          description={PIPELINE_HANDOFF_STATEMENT}
        >
          <PipelinePanel
            jobs={pipeline.jobs}
            contentOptions={pipeline.contentOptions}
          />
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
