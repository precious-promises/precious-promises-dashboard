import { Gauge } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
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
  verify_scripture: "Scripture needs checking before anything else proceeds.",
  produce: "A video composition exists and is being built.",
  approve: "Approved and waiting to be given a time.",
  schedule: "A time is set. Nothing sends it — no publishing exists.",
};

function Card({ card }: { card: BoardCard }) {
  const scheduled = card.schedules.filter(
    (post) => post.status === "scheduled",
  );
  const paused = card.schedules.filter((post) => post.status === "paused");

  return (
    <li>
      <Link
        href={`/dashboard/content/${card.item.id}`}
        className="block rounded-lg border border-edge/70 bg-panel-raised/40 px-3 py-2.5 transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
      >
        <span className="block text-sm font-medium text-ink-primary">
          {card.item.title}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-muted">
          {CONTENT_TYPE_LABELS[card.item.content_type]}
          {card.item.topic ? ` · ${card.item.topic}` : ""}
        </span>

        <span className="mt-2 flex flex-wrap gap-1">
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

        <span className="mt-2 block text-[11px] leading-5 text-ink-muted">
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
          <span className="mt-2 block rounded-md border border-gold-dim/50 bg-gold/10 px-2 py-1 text-[11px] text-gold">
            {card.staleApprovals} approval
            {card.staleApprovals === 1 ? "" : "s"} withdrawn after a content
            change.
          </span>
        ) : null}

        {scheduled.length > 0 ? (
          <span className="mt-2 block text-[11px] text-ink-secondary">
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

/**
 * The Production Board.
 *
 * Every column is **derived from records**. There is no stored board position
 * and no action that sets one: a card sits in Approve because an approval
 * exists and still matches its content, not because somebody dragged it there.
 * Dragging is deliberately absent rather than decorative — a drag that moved a
 * card without meeting the conditions would be the board lying about the work.
 *
 * `Publish` is not a column. Nothing publishes, so there is nowhere for a card
 * to arrive.
 */
export default async function ProductionBoardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const cards = await loadBoard();
  const byStage = groupByStage(cards);

  return (
    <DashboardShell
      title="Production Board"
      pathname="/dashboard/production"
      email={user.email ?? null}
    >
      <div className="flex w-full flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink-primary sm:text-3xl">
            Production Board
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-ink-secondary">
            Every column is worked out from the records — Scripture
            verification, saved scripts, video compositions, approvals and
            schedules. Cards move because the work moved, not because they were
            dragged.
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="pp-glass rounded-xl border border-edge">
            <EmptyState
              icon={Gauge}
              title="Nothing in production yet."
              description="Create a content item and it will appear here, in the column its records put it in."
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
          <div className="flex gap-4 overflow-x-auto pb-2">
            {BOARD_STAGES.map((stage) => {
              const stageCards = byStage.get(stage) ?? [];
              return (
                <section
                  key={stage}
                  className="pp-glass flex w-72 shrink-0 flex-col rounded-xl border border-edge"
                >
                  <div className="border-b border-edge/70 px-3.5 py-3">
                    <h3 className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-primary">
                      {PRODUCTION_STAGE_LABELS[stage]}
                      <span className="text-xs font-normal text-ink-muted">
                        {stageCards.length}
                      </span>
                    </h3>
                    {STAGE_NOTES[stage] ? (
                      <p className="mt-1 text-[11px] leading-4 text-ink-muted">
                        {STAGE_NOTES[stage]}
                      </p>
                    ) : null}
                  </div>

                  <div className="px-3 py-3">
                    {stageCards.length === 0 ? (
                      <p className="text-xs text-ink-muted">Nothing here.</p>
                    ) : (
                      <ul className="flex flex-col gap-2">
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

        <p className="text-xs text-ink-muted">
          {UNREACHABLE_STAGES.map(
            (stage) => PRODUCTION_STAGE_LABELS[stage],
          ).join(", ")}{" "}
          is not shown as a column. No publishing integration exists, so nothing
          can reach it.
        </p>
      </div>
    </DashboardShell>
  );
}
