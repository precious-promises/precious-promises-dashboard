import { isActionable, type ConfidenceLevel } from "./confidence";
import type { GroupFinding } from "./analysis";
import type { RepurposeCandidate } from "./repurpose";

/**
 * The weekly mission.
 *
 * One concrete thing to do this week, derived from what the data actually
 * shows. Deterministic — the same inputs always produce the same mission,
 * because a suggestion that changed on refresh would be indistinguishable from
 * one that was made up.
 *
 * ## When there is no mission
 *
 * There is frequently no mission, and that is a correct outcome rather than an
 * empty state to be filled. A dashboard that invents "post more Peace Shorts!"
 * from three data points teaches Dave to distrust it — and the moment a real
 * finding appears, he will not believe that one either.
 *
 * So `buildWeeklyMission` returns `null` unless something genuinely actionable
 * exists, and the interface says so plainly.
 */

export interface WeeklyMission {
  headline: string;
  /** What to do, in one sentence. */
  action: string;
  /** Why this and not something else — the evidence, stated. */
  rationale: string;
  /** The records the rationale rests on, for the owner to check. */
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface MissionInputs {
  /** Findings across topics, timing, duration and title style. */
  findings: readonly GroupFinding[];
  repurposeCandidates: readonly RepurposeCandidate[];
  /** How many posts have gone out in the observed period. */
  publishedCount: number;
  /** How many posts carry any measurement at all. */
  measuredCount: number;
}

/**
 * Build this week's mission, or decline to.
 *
 * The order of preference is deliberate: a repurpose suggestion rests on
 * content that already exists and already performed, which is more actionable
 * and better evidenced than a pattern across groups. A pattern only becomes a
 * mission when its confidence is genuinely actionable.
 */
export function buildWeeklyMission(
  inputs: MissionInputs,
): WeeklyMission | null {
  // Nothing measured means nothing to say. Not a weak mission — no mission.
  if (inputs.measuredCount === 0) {
    return null;
  }

  const strongRepurpose = inputs.repurposeCandidates.find((candidate) =>
    isActionable(candidate.confidence),
  );

  if (strongRepurpose) {
    return {
      headline: "Repurpose something that already worked",
      action:
        strongRepurpose.suggestedPlatform === null
          ? `Plan a new piece from “${strongRepurpose.title}”.`
          : `Plan a ${strongRepurpose.suggestedPlatform} variant of “${strongRepurpose.title}”.`,
      rationale: strongRepurpose.reason,
      evidence: [
        `Based on ${strongRepurpose.kind.replace(/_/g, " ")}.`,
        "Drawn from published posts and their recorded metrics, not from a projection.",
      ],
      confidence: strongRepurpose.confidence,
    };
  }

  const actionableFinding = inputs.findings.find(
    (finding) =>
      isActionable(finding.confidence.level) &&
      finding.differencePercent !== null &&
      finding.differencePercent > 0,
  );

  if (actionableFinding) {
    return {
      headline: `Lean into ${actionableFinding.groupLabel}`,
      action: `Produce one more piece in ${actionableFinding.groupLabel} this week.`,
      rationale: actionableFinding.headline,
      evidence: [
        `${actionableFinding.measuredCount} of ${actionableFinding.postCount} posts in this group carry the metric.`,
        ...actionableFinding.confidence.reasons,
        "This describes what the observed posts did. It is not a claim about cause.",
      ],
      confidence: actionableFinding.confidence.level,
    };
  }

  // Something is measured, but nothing rises to actionable. The honest move is
  // to say the data is still thin rather than to promote an early signal.
  return null;
}

/** What to show when there is no mission. Never a placeholder suggestion. */
export function missionAbsenceReason(inputs: MissionInputs): string {
  if (inputs.publishedCount === 0) {
    return "Nothing has been published yet, so there is nothing to measure and nothing to recommend.";
  }
  if (inputs.measuredCount === 0) {
    return "Posts have been published but no analytics have been fetched for them yet. Connect analytics and refresh to start building evidence.";
  }
  return "There is measured data, but no pattern yet strong enough to act on. A mission built from this little would be a guess wearing a recommendation's clothes.";
}
