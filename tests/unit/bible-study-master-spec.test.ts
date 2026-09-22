import { describe, expect, it } from "vitest";

import { validateBibleStudy } from "@/lib/bible-study/quality";
import {
  BIBLE_STUDY_SYSTEM_PROMPT,
  buildBibleStudyPrompt,
} from "@/lib/bible-study/spec";
import {
  canonicalBibleStudySchema,
  type BibleStudyRequest,
  type CanonicalBibleStudy,
} from "@/lib/bible-study/types";
import { buildWhatsAppTransform } from "@/lib/bible-study/whatsapp";

const request: BibleStudyRequest = {
  provider: "openai",
  topicOrPassage: "Romans 12:1-2",
  translation: "BSB",
  depth: "short",
  audience: "general_christian",
  emphasis: "renewing the mind",
};

const scripture = {
  reference: "Romans 12:1-2",
  translation: "BSB",
  text: "Verified fixture text",
  immediate_context: "The passage opens the practical section of Romans.",
  relevance: "It is the main passage under study.",
};

const study: CanonicalBibleStudy = {
  title: "Renewing the Mind",
  main_passage: scripture,
  main_truth: "God's mercy calls believers to transformed living.",
  opening_overview: "Overview ".repeat(20),
  historical_context: "Historical context ".repeat(20),
  literary_context: "Literary context ".repeat(20),
  situational_context: "Situational context ".repeat(20),
  verse_breakdown: [{ phrase: "Be transformed", explanation: "Explanation ".repeat(20) }],
  original_language: [
    {
      status: "grounded",
      form_in_verse: "form",
      original_word: "word",
      transliteration: "word",
      lemma: "lemma",
      strongs_number: "G1",
      lexical_meaning: "meaning",
      contextual_meaning: "meaning here",
      grammar: "grammar",
      why_it_matters: "why",
      grounding_note: "",
    },
  ],
  direct_cross_references: [scripture],
  supporting_cross_references: [scripture],
  biblical_examples: [scripture],
  major_themes: [
    {
      label: "Transformation",
      claim_level: "text_directly_states",
      explanation: "The text directly commands transformation.",
    },
  ],
  what_this_passage_does_not_mean: ["It is not mere positive thinking."],
  why_this_matters: "Why it matters ".repeat(20),
  practical_application: ["Apply the passage in concrete obedience."],
  study_reflection_questions: ["What is shaping your thinking?"],
  key_takeaways: ["Mercy comes before response."],
  final_summary: "Summary ".repeat(20),
  classifications: [
    { type: "doctrinal_teaching", explanation: "The passage teaches transformation." },
  ],
  source_translation_notes: ["BSB selected."],
  apologetics: [],
};

// Regression coverage for the provider-independent Bible Study contract.
describe("Precious Promises Bible Study Master Specification", () => {
  it("keeps the master standard provider-independent", () => {
    expect(BIBLE_STUDY_SYSTEM_PROMPT).toContain(
      "AI provider is only an execution engine",
    );
    expect(BIBLE_STUDY_SYSTEM_PROMPT).toContain(
      "never return a bare reference",
    );
    expect(BIBLE_STUDY_SYSTEM_PROMPT).toContain("canonical 66 books");
    expect(buildBibleStudyPrompt(request)).toContain("Romans 12:1-2");
  });

  it("requires Scripture text, context and relevance in every evidence block", () => {
    expect(() =>
      canonicalBibleStudySchema.parse({
        ...study,
        direct_cross_references: [
          {
            reference: "Ephesians 4:23",
            translation: "BSB",
            text: "",
            immediate_context: "",
            relevance: "",
          },
        ],
      }),
    ).toThrow();
  });

  it("never treats structural validation as human Scripture verification", () => {
    const report = validateBibleStudy(request, study);
    expect(report.requiresHumanScriptureReview).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/Human Scripture review/);
  });

  it("blocks silent translation mixing", () => {
    const report = validateBibleStudy(request, {
      ...study,
      supporting_cross_references: [
        { ...scripture, translation: "KJV" },
      ],
    });
    expect(report.valid).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/selected BSB translation/);
  });

  it("requires apologetics material only when apologetics is selected", () => {
    const report = validateBibleStudy(
      { ...request, audience: "apologetics" },
      study,
    );
    expect(report.valid).toBe(false);
    expect(report.blockers.join(" ")).toMatch(/Apologetics audience/);
  });

  it("derives WhatsApp output from the saved canonical study with Scripture text", () => {
    const output = buildWhatsAppTransform(study, "whatsapp_short");
    expect(output).toContain(study.main_passage.text);
    expect(output).toContain(study.main_passage.immediate_context);
    expect(output).toContain(study.main_passage.relevance);
  });
});
