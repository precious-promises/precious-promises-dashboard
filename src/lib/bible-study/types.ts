import { z } from "zod";

export const BIBLE_STUDY_PROVIDERS = ["anthropic", "openai"] as const;
export type BibleStudyProviderId = (typeof BIBLE_STUDY_PROVIDERS)[number];

export const BIBLE_STUDY_DEPTHS = ["short", "standard", "deep"] as const;
export type BibleStudyDepth = (typeof BIBLE_STUDY_DEPTHS)[number];

export const BIBLE_STUDY_AUDIENCES = [
  "seeker",
  "new_believer",
  "general_christian",
  "mature_christian",
  "teacher_preacher",
  "apologetics",
] as const;
export type BibleStudyAudience = (typeof BIBLE_STUDY_AUDIENCES)[number];

export const BIBLE_STUDY_TRANSLATIONS = ["BSB", "KJV"] as const;
export type BibleStudyTranslation = (typeof BIBLE_STUDY_TRANSLATIONS)[number];

export const BIBLE_STUDY_DEPTH_LABELS: Record<BibleStudyDepth, string> = {
  short: "Short",
  standard: "Standard",
  deep: "Deep",
};

export const BIBLE_STUDY_AUDIENCE_LABELS: Record<BibleStudyAudience, string> = {
  seeker: "Seeker",
  new_believer: "New believer",
  general_christian: "General Christian",
  mature_christian: "Mature Christian",
  teacher_preacher: "Teacher / Preacher",
  apologetics: "Apologetics",
};

export const bibleStudyRequestSchema = z
  .object({
    provider: z.enum(BIBLE_STUDY_PROVIDERS),
    topicOrPassage: z.string().trim().min(1).max(500),
    translation: z.enum(BIBLE_STUDY_TRANSLATIONS),
    depth: z.enum(BIBLE_STUDY_DEPTHS),
    audience: z.enum(BIBLE_STUDY_AUDIENCES),
    emphasis: z.string().trim().max(1000).optional().default(""),
  })
  .strict();

export type BibleStudyRequest = z.infer<typeof bibleStudyRequestSchema>;

export const scriptureEvidenceSchema = z
  .object({
    reference: z.string().trim().min(1).max(200),
    translation: z.string().trim().min(1).max(30),
    text: z.string().trim().min(1).max(12000),
    immediate_context: z.string().trim().min(1).max(6000),
    relevance: z.string().trim().min(1).max(6000),
  })
  .strict();

export type ScriptureEvidence = z.infer<typeof scriptureEvidenceSchema>;

const breakdownSchema = z
  .object({
    phrase: z.string().trim().min(1).max(1000),
    explanation: z.string().trim().min(1).max(12000),
  })
  .strict();

const languageSchema = z
  .object({
    status: z.enum(["grounded", "grounding_unavailable"]),
    form_in_verse: z.string().trim().max(500),
    original_word: z.string().trim().max(500),
    transliteration: z.string().trim().max(500),
    lemma: z.string().trim().max(500),
    strongs_number: z.string().trim().max(30),
    lexical_meaning: z.string().trim().max(3000),
    contextual_meaning: z.string().trim().max(4000),
    grammar: z.string().trim().max(3000),
    why_it_matters: z.string().trim().min(1).max(4000),
    grounding_note: z.string().trim().max(2000),
  })
  .strict();

export type OriginalLanguageItem = z.infer<typeof languageSchema>;

const themeSchema = z
  .object({
    label: z.string().trim().min(1).max(300),
    claim_level: z.enum([
      "text_directly_states",
      "this_implies",
      "wider_scripture_develops",
      "one_interpretation",
    ]),
    explanation: z.string().trim().min(1).max(6000),
  })
  .strict();

const classificationSchema = z
  .object({
    type: z.enum([
      "promise",
      "truth",
      "command",
      "warning",
      "prayer",
      "prophecy",
      "wisdom_principle",
      "historical_statement",
      "doctrinal_teaching",
      "conditional_promise",
      "unconditional_promise",
    ]),
    explanation: z.string().trim().min(1).max(3000),
  })
  .strict();

const apologeticsItemSchema = z
  .object({
    objection: z.string().trim().min(1).max(4000),
    claim: z.string().trim().max(4000),
    biblical_response: z.string().trim().min(1).max(8000),
    supporting_scripture: z.array(scriptureEvidenceSchema).max(8),
    historical_textual_evidence: z
      .array(z.string().trim().min(1).max(5000))
      .max(8),
    alternative_interpretation: z.string().trim().max(5000),
    response_to_alternative: z.string().trim().max(5000),
    practical_takeaway: z.string().trim().min(1).max(4000),
  })
  .strict();

export const canonicalBibleStudySchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    main_passage: scriptureEvidenceSchema,
    main_truth: z.string().trim().min(1).max(3000),
    opening_overview: z.string().trim().min(1).max(10000),
    historical_context: z.string().trim().min(1).max(12000),
    literary_context: z.string().trim().min(1).max(12000),
    situational_context: z.string().trim().min(1).max(12000),
    verse_breakdown: z.array(breakdownSchema).min(1).max(40),
    original_language: z.array(languageSchema).max(20),
    direct_cross_references: z.array(scriptureEvidenceSchema).max(12),
    supporting_cross_references: z.array(scriptureEvidenceSchema).max(16),
    biblical_examples: z.array(scriptureEvidenceSchema).max(12),
    major_themes: z.array(themeSchema).min(1).max(16),
    what_this_passage_does_not_mean: z
      .array(z.string().trim().min(1).max(5000))
      .min(1)
      .max(16),
    why_this_matters: z.string().trim().min(1).max(10000),
    practical_application: z
      .array(z.string().trim().min(1).max(5000))
      .min(1)
      .max(20),
    study_reflection_questions: z
      .array(z.string().trim().min(1).max(2000))
      .min(1)
      .max(24),
    key_takeaways: z.array(z.string().trim().min(1).max(2000)).min(1).max(16),
    final_summary: z.string().trim().min(1).max(10000),
    classifications: z.array(classificationSchema).min(1).max(12),
    source_translation_notes: z
      .array(z.string().trim().min(1).max(5000))
      .min(1)
      .max(16),
    apologetics: z.array(apologeticsItemSchema).max(10),
  })
  .strict();

export type CanonicalBibleStudy = z.infer<typeof canonicalBibleStudySchema>;

export function bibleStudyJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(canonicalBibleStudySchema) as Record<string, unknown>;
}

export interface BibleStudyValidationReport {
  valid: boolean;
  blockers: string[];
  warnings: string[];
  wordCount: number;
  scriptureBlocks: number;
  requiresHumanScriptureReview: true;
}

export const BIBLE_STUDY_REVIEW_STATES = [
  "draft",
  "ready_for_review",
  "approved",
  "rejected",
] as const;
export type BibleStudyReviewState = (typeof BIBLE_STUDY_REVIEW_STATES)[number];

export interface BibleStudyRevisionRecord {
  id: string;
  owner_id: string;
  study_id: string;
  revision_number: number;
  request_fingerprint: string;
  content_hash: string;
  provider: BibleStudyProviderId;
  model: string;
  specification_version: string;
  prompt_version: string;
  canonical_study: CanonicalBibleStudy;
  validation_report: BibleStudyValidationReport;
  review_state: BibleStudyReviewState;
  scripture_verification_status: "verification_required" | "manually_verified";
  scripture_verified_at: string | null;
  scripture_verified_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  estimated_cost: number | null;
  created_at: string;
}

export type BibleStudyGenerationResult =
  | {
      ok: true;
      study: CanonicalBibleStudy;
      provider: BibleStudyProviderId;
      model: string;
      inputTokens: number | null;
      outputTokens: number | null;
      latencyMs: number | null;
    }
  | {
      ok: false;
      category:
        | "not_configured"
        | "invalid_output"
        | "refused"
        | "rate_limited"
        | "provider_unavailable"
        | "transient"
        | "unknown";
      detail: string;
    };

export interface BibleStudyProvider {
  readonly id: BibleStudyProviderId;
  readonly model: string;
  generate(request: BibleStudyRequest): Promise<BibleStudyGenerationResult>;
}
