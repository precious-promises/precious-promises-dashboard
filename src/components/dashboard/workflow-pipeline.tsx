import { ChevronRight } from "lucide-react";

/**
 * The approved content workflow from docs/state-machines.md.
 *
 * Every count is 0 because no content records exist. This is the workflow
 * *architecture* rendered as a diagram — not a live queue view.
 */
const STAGES = [
  "Plan",
  "Write",
  "Produce",
  "Review",
  "Approve",
  "Schedule",
  "Publish",
] as const;

export function WorkflowPipeline() {
  return (
    <div>
      <ol
        className="flex flex-wrap items-stretch gap-2"
        aria-label="Content production workflow"
      >
        {STAGES.map((stage, index) => (
          <li key={stage} className="flex flex-1 items-center gap-2">
            <div className="min-w-[5.5rem] flex-1 rounded-lg border border-edge/70 bg-panel-raised/40 px-3 py-3 text-center">
              <p className="text-xs font-medium tracking-wide text-ink-secondary">
                {stage}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">
                0
              </p>
            </div>
            {index < STAGES.length - 1 ? (
              <ChevronRight
                aria-hidden="true"
                className="hidden size-4 shrink-0 text-ink-muted lg:block"
              />
            ) : null}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-5 text-ink-muted">
        This is the approved workflow structure. Counts stay at zero until the
        content workflow is built — they are not a live queue.
      </p>
    </div>
  );
}
