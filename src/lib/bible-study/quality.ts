import type {
  BibleStudyDepth,
  BibleStudyRequest,
  BibleStudyValidationReport,
  CanonicalBibleStudy,
  ScriptureEvidence,
} from "./types";

function words(value: string): number {
  return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
}

function allText(study: CanonicalBibleStudy): string {
  return [
    study.title,
    study.main_passage.text,
    study.main_truth,
    study.opening_overview,
    study.historical_context,
    study.literary_context,
    study.situational_context,
    ...study.verse_breakdown.flatMap((item) => [item.phrase, item.explanation]),
    ...study.major_themes.map((item) => item.explanation),
    ...study.what_this_passage_does_not_mean,
    study.why_this_matters,
    ...study.practical_application,
    ...study.study_reflection_questions,
    ...study.key_takeaways,
    study.final_summary,
  ].join(" ");
}

function scriptureProblem(
  block: ScriptureEvidence,
  selectedTranslation: string,
): string | null {
  if (
    !block.reference.trim() ||
    !block.text.trim() ||
    !block.translation.trim() ||
    !block.immediate_context.trim() ||
    !block.relevance.trim()
  ) {
    return "A Scripture block is missing reference, text, translation, context or relevance.";
  }
  if (block.translation !== selectedTranslation) {
    return `${block.reference} is labelled ${block.translation}, not the selected ${selectedTranslation} translation.`;
  }
  return null;
}

function expectedRange(depth: BibleStudyDepth): [number, number] {
  if (depth === "short") return [800, 1200];
  if (depth === "standard") return [2500, 3500];
  return [4000, 100000];
}

export function validateBibleStudy(
  request: BibleStudyRequest,
  study: CanonicalBibleStudy,
): BibleStudyValidationReport {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const scripture = [
    study.main_passage,
    ...study.direct_cross_references,
    ...study.supporting_cross_references,
    ...study.biblical_examples,
    ...study.apologetics.flatMap((item) => item.supporting_scripture),
  ];

  for (const block of scripture) {
    const problem = scriptureProblem(block, request.translation);
    if (problem) blockers.push(problem);
  }

  if (study.main_passage.translation !== request.translation) {
    blockers.push("The main passage does not use the requested translation.");
  }

  for (const item of study.original_language) {
    if (item.status === "grounded") {
      if (
        !item.original_word ||
        !item.transliteration ||
        !item.lemma ||
        !item.lexical_meaning ||
        !item.contextual_meaning ||
        !item.why_it_matters
      ) {
        blockers.push(
          "A grounded original-language entry is missing required lexical/contextual fields.",
        );
      }
    } else if (!item.grounding_note) {
      blockers.push(
        "An unavailable original-language grounding must explain what is unavailable.",
      );
    }
  }

  if (request.audience === "apologetics" && study.apologetics.length === 0) {
    blockers.push(
      "Apologetics audience was selected but no apologetics material was returned.",
    );
  }

  const wordCount = words(allText(study));
  const [minimum, maximum] = expectedRange(request.depth);
  if (wordCount < minimum) {
    warnings.push(
      `The study is shorter than the ${request.depth} guidance (${wordCount} words).`,
    );
  }
  if (wordCount > maximum) {
    warnings.push(
      `The study is longer than the ${request.depth} guidance (${wordCount} words). Check for repetition before approval.`,
    );
  }

  if (
    !study.major_themes.some(
      (theme) => theme.claim_level === "text_directly_states",
    )
  ) {
    warnings.push(
      'No major theme is explicitly labelled "Text directly states"; review claim-level distinctions.',
    );
  }

  warnings.push(
    "Human Scripture review is required: structural validation cannot prove that AI-quoted verse wording exactly matches the selected Bible edition.",
  );
  warnings.push(
    "Historical and original-language claims require human/source review before final approval; structural validation cannot independently authenticate them.",
  );

  return {
    valid: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    wordCount,
    scriptureBlocks: scripture.length,
    requiresHumanScriptureReview: true,
  };
}
