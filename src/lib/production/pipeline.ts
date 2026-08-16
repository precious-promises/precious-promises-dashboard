/**
 * The production pipeline: a workflow assistant, not an autonomous machine.
 *
 * A production job tracks one content item's journey through the optional
 * generation steps — script drafting, narration, rendering — and ends at
 * `ready_for_review`. **That is the last word this vocabulary has.** Review,
 * approval, scheduling and publishing are the Stage 5/6 paths, human-driven,
 * and no status here names or reaches any of them. This module imports
 * nothing from publishing and writes to no publishing table.
 *
 * Every advance is explicitly requested by the owner. Failure at a step
 * blocks later steps; cancellation stops future steps and deletes nothing.
 */

export const PRODUCTION_JOB_STATUSES = [
  "pending",
  "planning",
  "generating_text",
  "generating_voice",
  "rendering",
  "ready_for_review",
  "failed",
  "cancelled",
] as const;
export type ProductionJobStatus = (typeof PRODUCTION_JOB_STATUSES)[number];

export const PRODUCTION_JOB_STATUS_LABELS: Record<ProductionJobStatus, string> =
  {
    pending: "Pending",
    planning: "Planning",
    generating_text: "Generating text",
    generating_voice: "Generating voice",
    rendering: "Rendering",
    ready_for_review: "Ready for review",
    failed: "Failed",
    cancelled: "Cancelled",
  };

/** Statuses from which no further pipeline work happens. */
export const TERMINAL_PRODUCTION_STATUSES: readonly ProductionJobStatus[] = [
  "ready_for_review",
  "cancelled",
];

/**
 * The permitted moves.
 *
 * The generation steps are optional and ordered: a job may skip a step
 * forward, never jump backward, and nothing leaves `ready_for_review` — the
 * pipeline's job is done and the human paths take over. `failed` may return
 * to `pending` only by an explicit retry.
 */
const PRODUCTION_TRANSITIONS: Record<
  ProductionJobStatus,
  readonly ProductionJobStatus[]
> = {
  pending: ["planning", "cancelled"],
  planning: [
    "generating_text",
    "generating_voice",
    "rendering",
    "ready_for_review",
    "cancelled",
  ],
  generating_text: [
    "generating_voice",
    "rendering",
    "ready_for_review",
    "failed",
    "cancelled",
  ],
  generating_voice: ["rendering", "ready_for_review", "failed", "cancelled"],
  rendering: ["ready_for_review", "failed", "cancelled"],
  ready_for_review: [],
  failed: ["pending", "cancelled"],
  cancelled: [],
};

export function canTransitionProduction(
  from: ProductionJobStatus,
  to: ProductionJobStatus,
): boolean {
  return PRODUCTION_TRANSITIONS[from].includes(to);
}

export interface ProductionJob {
  id: string;
  owner_id: string;
  content_item_id: string;
  video_project_id: string | null;
  status: ProductionJobStatus;
  ai_generation_id: string | null;
  voice_job_id: string | null;
  render_job_id: string | null;
  failure_category: string | null;
  failure_detail: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

/**
 * What `ready_for_review` hands over to.
 *
 * Stated as data so the interface and the tests carry the same sentence:
 * the pipeline ends here, and the next steps are the existing human ones.
 */
export const PIPELINE_HANDOFF_STATEMENT =
  "The pipeline ends at ready for review. Approval, scheduling and publishing remain the existing human steps — nothing moves from generation to publication without them.";
