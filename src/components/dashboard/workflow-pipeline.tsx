import { ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  BOARD_STAGES,
  PRODUCTION_STAGE_LABELS,
  type ProductionStage,
} from "@/lib/production/stage";

/**
 * The production pipeline, with real counts.
 *
 * Stage 5 replaced the diagram with live figures: every number is how many
 * content items the classifier currently puts in that stage, derived from
 * Scripture verification, saved scripts, video compositions, approvals and
 * schedules.
 *
 * `Publish` is not shown. Nothing publishes, so a Publish column would be a
 * count of zero that implied a capability the product does not have.
 */
export function WorkflowPipeline({
  counts,
}: {
  counts: Partial<Record<ProductionStage, number>>;
}) {
  return (
    <div>
      <ol
        className="flex flex-wrap items-stretch gap-2"
        aria-label="Content production workflow"
      >
        {BOARD_STAGES.map((stage, index) => (
          <li key={stage} className="flex flex-1 items-center gap-2">
            <Link
              href="/dashboard/production"
              className="min-w-[5.5rem] flex-1 rounded-lg border border-edge/70 bg-panel-raised/40 px-3 py-3 text-center transition-colors hover:border-edge-strong hover:bg-panel-hover/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-highlight"
            >
              <span className="block text-xs font-medium tracking-wide text-ink-secondary">
                {PRODUCTION_STAGE_LABELS[stage]}
              </span>
              <span className="mt-1 block text-xl font-semibold tabular-nums text-ink-primary">
                {counts[stage] ?? 0}
              </span>
            </Link>
            {index < BOARD_STAGES.length - 1 ? (
              <ChevronRight
                aria-hidden="true"
                className="hidden size-4 shrink-0 text-ink-muted lg:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-5 text-ink-muted">
        Live counts, derived from the records. Publish is not a stage here — no
        publishing integration exists, so nothing can reach it.
      </p>
    </div>
  );
}
