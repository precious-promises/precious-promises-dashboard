import type { ConfidenceLevel } from "./confidence";

/**
 * Content experiments.
 *
 * **Observational, and the name is load-bearing.** None of these platforms
 * offers random simultaneous assignment, so nothing here is an A/B test and
 * this module refuses to imply otherwise. Two posts a fortnight apart differ
 * in more than the one dimension being varied — the audience changed, the
 * schedule changed, the world changed — and calling that an A/B test would
 * lend a result more authority than it can carry.
 *
 * So: a hypothesis, a dimension, a set of posts, and an observation the owner
 * writes. **No result is ever auto-declared.** The system can show what the
 * numbers did; concluding what it means is a human judgement, and one the
 * database schema deliberately leaves to a human.
 */

export const EXPERIMENT_DIMENSIONS = [
  "title_style",
  "thumbnail_text",
  "content_length",
  "posting_time",
  "cta",
  "topic",
  "format",
] as const;

export type ExperimentDimension = (typeof EXPERIMENT_DIMENSIONS)[number];

export const EXPERIMENT_DIMENSION_LABELS: Record<ExperimentDimension, string> =
  {
    title_style: "Title style",
    thumbnail_text: "Thumbnail wording",
    content_length: "Content length",
    posting_time: "Posting time",
    cta: "Call to action",
    topic: "Topic",
    format: "Format",
  };

export const EXPERIMENT_STATUSES = [
  "planned",
  "running",
  "observed",
  "inconclusive",
  "abandoned",
] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const EXPERIMENT_STATUS_LABELS: Record<ExperimentStatus, string> = {
  planned: "Planned",
  running: "Running",
  observed: "Observed",
  inconclusive: "Inconclusive",
  abandoned: "Abandoned",
};

export const EXPERIMENT_STATUS_DETAIL: Record<ExperimentStatus, string> = {
  planned: "Written down, not started.",
  running: "Posts are going out under this experiment.",
  observed:
    "Finished, with what was seen written down. An observation, not a proof.",
  inconclusive:
    "Finished without a readable difference. Recorded so it is not repeated by accident.",
  abandoned: "Stopped before it produced anything.",
};

export interface GrowthExperiment {
  id: string;
  owner_id: string;
  name: string;
  hypothesis: string;
  dimension: ExperimentDimension;
  status: ExperimentStatus;
  started_on: string | null;
  ended_on: string | null;
  observation: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentPost {
  id: string;
  experiment_id: string;
  scheduled_post_id: string;
  arm: string;
}

/**
 * Whether an experiment has enough behind it to be worth concluding.
 *
 * Advisory only — it informs what the interface says, and **never** writes a
 * status by itself. An owner may conclude an experiment on two posts if they
 * want to; what the system will not do is conclude one *for* them, or dress a
 * thin result up as a finding.
 */
export function experimentReadiness(input: {
  postsPerArm: Map<string, number>;
  status: ExperimentStatus;
}): { canConclude: boolean; confidence: ConfidenceLevel; reason: string } {
  const arms = [...input.postsPerArm.entries()];

  if (arms.length < 2) {
    return {
      canConclude: false,
      confidence: "insufficient_data",
      reason:
        "An experiment needs at least two arms to compare. With one, there is nothing to compare against.",
    };
  }

  const smallest = Math.min(...arms.map(([, count]) => count));

  if (smallest < 3) {
    return {
      canConclude: false,
      confidence: "insufficient_data",
      reason: `The smallest arm has ${smallest} ${smallest === 1 ? "post" : "posts"}. Below three, a difference is indistinguishable from chance.`,
    };
  }

  if (smallest < 6) {
    return {
      canConclude: true,
      confidence: "early_signal",
      reason:
        "Enough posts to notice a difference, not enough to rely on it. Record what you saw and treat it as a lead.",
    };
  }

  return {
    canConclude: true,
    confidence: "moderate_evidence",
    reason:
      "Enough comparable posts per arm to be worth writing down. Still an observation about these posts, not a general rule.",
  };
}

/**
 * Why this is not called an A/B test, in one sentence, for the interface.
 *
 * Stated in the product rather than buried in a doc, because the person
 * reading a result is the person who most needs to know what kind of result it
 * is.
 */
export const OBSERVATIONAL_NOTE =
  "These are observational experiments. None of these platforms lets this dashboard assign viewers randomly and simultaneously, so posts differ in more than the one thing being varied — the audience, the schedule and the moment all moved too. Treat a result as something worth trying again, never as proof.";
