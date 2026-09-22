import type { CanonicalBibleStudy, ScriptureEvidence } from "./types";

export type WhatsAppBibleStudyFormat =
  | "whatsapp_short"
  | "whatsapp_study"
  | "whatsapp_teaching";

function scripture(block: ScriptureEvidence): string {
  return [
    `*${block.reference} ${block.translation}*`,
    `“${block.text}”`,
    `_Context:_ ${block.immediate_context}`,
    `_Why it matters here:_ ${block.relevance}`,
  ].join("\n");
}

function crossReference(block: ScriptureEvidence): string {
  return scripture(block);
}

function bullets(values: string[]): string {
  return values.map((value) => `• ${value}`).join("\n");
}

/**
 * Token-free transforms. They only compress the already-saved canonical study;
 * they never regenerate theology from the original topic.
 */
export function buildWhatsAppTransform(
  study: CanonicalBibleStudy,
  format: WhatsAppBibleStudyFormat,
): string {
  const direct = study.direct_cross_references[0] ?? null;
  const supporting = study.supporting_cross_references[0] ?? null;

  if (format === "whatsapp_short") {
    return [
      `*${study.title}*`,
      "",
      scripture(study.main_passage),
      "",
      `*Main truth:* ${study.main_truth}`,
      "",
      study.opening_overview,
      direct ? `\n*Direct cross-reference*\n${crossReference(direct)}` : "",
      "",
      `*Takeaway:* ${study.key_takeaways[0] ?? study.final_summary}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (format === "whatsapp_study") {
    return [
      `*${study.title}*`,
      "",
      scripture(study.main_passage),
      "",
      `*Main truth*\n${study.main_truth}`,
      "",
      `*Context*\n${study.literary_context}\n\n${study.situational_context}`,
      "",
      `*Explanation*\n${study.verse_breakdown
        .slice(0, 5)
        .map((item) => `*${item.phrase}*\n${item.explanation}`)
        .join("\n\n")}`,
      direct ? `\n*Direct cross-reference*\n${crossReference(direct)}` : "",
      supporting
        ? `\n*Supporting cross-reference*\n${crossReference(supporting)}`
        : "",
      "",
      `*Application*\n${bullets(study.practical_application.slice(0, 4))}`,
      "",
      `*Key takeaway:* ${study.key_takeaways[0] ?? study.final_summary}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `*${study.title}*`,
    "",
    scripture(study.main_passage),
    "",
    `*Main truth*\n${study.main_truth}`,
    "",
    `*Historical context*\n${study.historical_context}`,
    "",
    `*Literary / situational context*\n${study.literary_context}\n\n${study.situational_context}`,
    "",
    `*Phrase-by-phrase*\n${study.verse_breakdown
      .slice(0, 8)
      .map((item) => `*${item.phrase}*\n${item.explanation}`)
      .join("\n\n")}`,
    study.original_language.length
      ? `\n*Original language*\n${study.original_language
          .slice(0, 3)
          .map(
            (item) =>
              `• ${item.original_word || item.lemma} (${item.transliteration}) — ${item.contextual_meaning || item.grounding_note}`,
          )
          .join("\n")}`
      : "",
    direct ? `\n*Direct cross-reference*\n${crossReference(direct)}` : "",
    supporting
      ? `\n*Supporting cross-reference*\n${crossReference(supporting)}`
      : "",
    "",
    `*What this does not mean*\n${bullets(
      study.what_this_passage_does_not_mean.slice(0, 4),
    )}`,
    "",
    `*Application*\n${bullets(study.practical_application.slice(0, 6))}`,
    "",
    `*Key takeaways*\n${bullets(study.key_takeaways.slice(0, 6))}`,
  ]
    .filter(Boolean)
    .join("\n");
}
