import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Gauge,
  GitBranch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PLATFORM_LABELS, REVIEW_STATE_LABELS } from "@/lib/variants/types";

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
  accent,
}: {
  label: string;
  value: number;
  description: string;
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
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-[-0.035em] text-ink-primary">
            {value}
          </p>
        </div>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${accentClasses[accent]}`}
        >
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">{description}</p>
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
        className="group block rounded-xl border border-edge/70 bg-[#0b1120]/80 px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:bg-[#0e1526] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
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
            className="mt-0.5 size-3.5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-[#bda7ff]"
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

        <span className="mt-2.5 block rounded-lg border border-edge/60 bg-black/15 px-2.5 py-2 text-[11px] leading-5 text-ink-muted">
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
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5 sm:gap-6">
        <section className="relative overflow-hidden rounded-[24px] border border-edge/80 bg-[#090e1b] shadow-[0_30px_90px_rgba(0,0,0,0.34)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(112,55,221,0.24),transparent_33%),radial-gradient(circle_at_78%_8%,rgba(201,169,97,0.11),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.018),transparent_44%)]"
          />
          <div className="relative grid gap-6 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[1fr_auto] xl:items-end xl:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-gold">
                <Sparkles aria-hidden="true" className="size-3.5" />
                Production Command Centre
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-ink-primary sm:text-4xl lg:text-[42px]">
                Production Board
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
                See where every content item genuinely sits based on Scripture,
                script, video, review, approval and scheduling records. Position
                is derived from evidence rather than manually assigned.
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link
                  href="/dashboard/content/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                >
                  Create content
                </Link>
                <Link
                  href="/dashboard/content"
                  className="inline-flex items-center gap-2 rounded-xl border border-edge-strong bg-white/[0.025] px-4 py-2.5 text-sm font-medium text-ink-primary transition hover:bg-white/[0.055]"
                >
                  Content Library
                </Link>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-edge/75 bg-black/15 px-4 py-3 xl:min-w-[300px]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-ink-primary">
                  Evidence-derived workflow
                </span>
                <span className="mt-0.5 block text-[11px] leading-4 text-ink-muted">
                  No drag-and-drop bypass of verification or approval.
                </span>
              </span>
            </div>
          </div>
        </section>

        <section
          aria-label="Production summary"
          className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6"
        >
          <MetricCard
            label="In production"
            value={cards.length}
            description="Items represented on the derived board."
            icon={Gauge}
            accent="purple"
          />
          <MetricCard
            label="Scripture attention"
            value={scriptureAttention}
            description="Blocked until Scripture is confirmed."
            icon={CircleAlert}
            accent="gold"
          />
          <MetricCard
            label="Ready for review"
            value={reviewReady}
            description="Genuinely reached human review."
            icon={ShieldCheck}
            accent="blue"
          />
          <MetricCard
            label="Approved"
            value={approved}
            description="Valid approval still matching content."
            icon={CheckCircle2}
            accent="green"
          />
          <MetricCard
            label="Scheduled"
            value={scheduled}
            description="Approved content with an active schedule."
            icon={CheckCircle2}
            accent="neutral"
          />
          <MetricCard
            label="Active pipeline"
            value={activePipelineJobs}
            description="Generation jobs still progressing."
            icon={GitBranch}
            accent="purple"
          />
        </section>

        {failedPipelineJobs > 0 ? (
          <section className="rounded-2xl border border-red-900/50 bg-red-950/25 px-4 py-3.5 shadow-[0_14px_35px_rgba(0,0,0,0.18)] sm:px-5">
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

        <section className="overflow-hidden rounded-2xl border border-edge/80 bg-[#0a0f1d]/92 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
          <div className="border-b border-edge/70 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                  Evidence-derived workflow
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink-primary sm:text-2xl">
                  Current production stages
                </h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
                  Cards move only when the underlying records change. Scripture
                  verification, human review, approval and scheduling cannot be
                  bypassed by moving a card.
                </p>
              </div>
              <p className="text-xs font-medium text-ink-secondary">
                {cards.length}{" "}
                {cards.length === 1 ? "content item" : "content items"}
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
                    className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(103,46,214,0.28)] transition hover:brightness-110"
                  >
                    Create content
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
                      className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-edge/80 bg-[#090f1c]/85 shadow-[0_14px_35px_rgba(0,0,0,0.16)]"
                    >
                      <div className="border-b border-edge/70 bg-white/[0.018] px-4 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-semibold text-ink-primary">
                            {PRODUCTION_STAGE_LABELS[stage]}
                          </h4>
                          <span className="flex size-7 items-center justify-center rounded-full border border-[#7138dc]/25 bg-[#7138dc]/10 text-xs font-semibold text-[#c4b1ff]">
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

        <section className="rounded-2xl border border-edge/80 bg-[#0a0f1d]/75 px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <ShieldCheck aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink-primary">
                Production truth boundary
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {UNREACHABLE_STAGES.map(
                  (stage) => PRODUCTION_STAGE_LABELS[stage],
                ).join(", ")}{" "}
                is not a board column. Publishing reports through the separate
                Publish Queue, which preserves per-platform attempts and
                outcomes instead of flattening them into a card position.
              </p>
            </div>
          </div>
        </section>

        <SectionCard
          title="Production pipeline"
          description={PIPELINE_HANDOFF_STATEMENT}
          className="shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
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
