import { z } from "zod";

/**
 * The AI assistance vocabulary.
 *
 * ## The rule everything rests on
 *
 * **There is no Scripture output field.** Every generation type maps to a
 * fixed set of typed output fields — script sections, captions, titles,
 * notes — and none of them is Scripture. The response schema is closed
 * (`.strict()`), so a response that tries to return a `scripture` field, or
 * any field outside its type's set, fails validation and is recorded as a
 * failed generation. "The model returned replacement Scripture as trusted
 * Scripture" is not a parseable outcome.
 *
 * Anything Scripture-shaped *inside* a permitted field is ordinary generated
 * text: unverified, labelled as generated, and only ever becoming verified
 * Scripture through the existing verification system — which AI cannot
 * touch.
 *
 * Everything the model produces is a **draft**. Acceptance is a human act
 * with its own recorded path.
 */

export const AI_GENERATION_TYPES = [
  "script_draft",
  "script_shorten",
  "commentary_expand",
  "short_conversion",
  "prayer",
  "declaration",
  "title",
  "description",
  "caption",
  "hashtags",
  "cta",
  "plan_note",
] as const;

export type AiGenerationType = (typeof AI_GENERATION_TYPES)[number];

export const AI_GENERATION_LABELS: Record<AiGenerationType, string> = {
  script_draft: "Script draft",
  script_shorten: "Shortened script",
  commentary_expand: "Expanded commentary",
  short_conversion: "Short-form conversion",
  prayer: "Prayer draft",
  declaration: "Declaration draft",
  title: "Title draft",
  description: "Description draft",
  caption: "Caption draft",
  hashtags: "Hashtag suggestions",
  cta: "Call-to-action suggestion",
  plan_note: "Plan note",
};

/** Which generation types produce script sections vs variant fields. */
export const SCRIPT_GENERATION_TYPES: readonly AiGenerationType[] = [
  "script_draft",
  "script_shorten",
  "commentary_expand",
  "short_conversion",
  "prayer",
  "declaration",
];

export const VARIANT_GENERATION_TYPES: readonly AiGenerationType[] = [
  "title",
  "description",
  "caption",
  "hashtags",
  "cta",
];

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * The closed output schema per generation type.
 *
 * `.strict()` is the enforcement: an unexpected key — `scripture`,
 * `verse_text`, anything — fails the parse. These field names deliberately
 * mirror the script sections and variant columns the acceptance paths write,
 * and nothing else.
 */
export const AI_OUTPUT_SCHEMAS: Record<AiGenerationType, z.ZodTypeAny> = {
  script_draft: z
    .object({
      hook: optionalText(5000),
      explanation: optionalText(20000),
      declaration: optionalText(10000),
      prayer: optionalText(10000),
      outro: optionalText(5000),
    })
    .strict(),
  script_shorten: z
    .object({
      hook: optionalText(5000),
      explanation: optionalText(20000),
      declaration: optionalText(10000),
      prayer: optionalText(10000),
      outro: optionalText(5000),
    })
    .strict(),
  commentary_expand: z.object({ explanation: text(20000) }).strict(),
  short_conversion: z
    .object({
      hook: optionalText(5000),
      explanation: optionalText(20000),
      outro: optionalText(5000),
    })
    .strict(),
  prayer: z.object({ prayer: text(10000) }).strict(),
  declaration: z.object({ declaration: text(10000) }).strict(),
  title: z.object({ title: text(300) }).strict(),
  description: z.object({ description: text(10000) }).strict(),
  caption: z.object({ caption: text(5000) }).strict(),
  hashtags: z
    .object({ hashtags: z.array(z.string().trim().min(1).max(60)).max(30) })
    .strict(),
  cta: z.object({ cta: text(500) }).strict(),
  plan_note: z.object({ note: text(2000) }).strict(),
};

/**
 * The same schemas as plain JSON Schema, for providers that constrain the
 * response server-side. Closed objects, always.
 */
export function jsonSchemaFor(type: AiGenerationType): Record<string, unknown> {
  const str = (maxLength: number) => ({ type: "string", maxLength });

  const shapes: Record<AiGenerationType, Record<string, unknown>> = {
    script_draft: {
      type: "object",
      properties: {
        hook: str(5000),
        explanation: str(20000),
        declaration: str(10000),
        prayer: str(10000),
        outro: str(5000),
      },
      required: [],
      additionalProperties: false,
    },
    script_shorten: {
      type: "object",
      properties: {
        hook: str(5000),
        explanation: str(20000),
        declaration: str(10000),
        prayer: str(10000),
        outro: str(5000),
      },
      required: [],
      additionalProperties: false,
    },
    commentary_expand: {
      type: "object",
      properties: { explanation: str(20000) },
      required: ["explanation"],
      additionalProperties: false,
    },
    short_conversion: {
      type: "object",
      properties: {
        hook: str(5000),
        explanation: str(20000),
        outro: str(5000),
      },
      required: [],
      additionalProperties: false,
    },
    prayer: {
      type: "object",
      properties: { prayer: str(10000) },
      required: ["prayer"],
      additionalProperties: false,
    },
    declaration: {
      type: "object",
      properties: { declaration: str(10000) },
      required: ["declaration"],
      additionalProperties: false,
    },
    title: {
      type: "object",
      properties: { title: str(300) },
      required: ["title"],
      additionalProperties: false,
    },
    description: {
      type: "object",
      properties: { description: str(10000) },
      required: ["description"],
      additionalProperties: false,
    },
    caption: {
      type: "object",
      properties: { caption: str(5000) },
      required: ["caption"],
      additionalProperties: false,
    },
    hashtags: {
      type: "object",
      properties: {
        hashtags: { type: "array", items: str(60) },
      },
      required: ["hashtags"],
      additionalProperties: false,
    },
    cta: {
      type: "object",
      properties: { cta: str(500) },
      required: ["cta"],
      additionalProperties: false,
    },
    plan_note: {
      type: "object",
      properties: { note: str(2000) },
      required: ["note"],
      additionalProperties: false,
    },
  };

  return shapes[type];
}

/**
 * The verified Scripture context handed to the model — read-only input,
 * never output. Assembled only from the stored, verified record.
 */
export interface ScriptureContext {
  reference: string;
  text: string;
  translation: string;
}

export interface AiDraftRequest {
  type: AiGenerationType;
  /** What the owner asked for, in their words. */
  instruction: string;
  /** Read-only verified Scripture context, when the content item has it. */
  scripture: ScriptureContext | null;
  /** Existing material the generation works from (current script, topic…). */
  workingMaterial: string | null;
  /** Platform, for caption-shaped generations. Informs limits in the prompt. */
  platform: "youtube" | "instagram" | "tiktok" | null;
}

export type AiDraftFailureCategory =
  | "not_configured"
  | "invalid_output"
  | "refused"
  | "rate_limited"
  | "provider_unavailable"
  | "transient"
  | "unknown";

export interface AiDraftSuccess {
  ok: true;
  /** Validated against the type's closed schema before anything is stored. */
  output: Record<string, unknown>;
  provider: string;
  model: string;
}

export interface AiDraftFailure {
  ok: false;
  category: AiDraftFailureCategory;
  detail: string;
}

export type AiDraftResult = AiDraftSuccess | AiDraftFailure;

/**
 * The provider seam. One method: produce a draft. No tools, no loops, no
 * side effects — a provider that could act would be an agent, and this
 * product forbids an autonomous one.
 */
export interface AIProvider {
  readonly id: string;
  readonly model: string;
  generateDraft(request: AiDraftRequest): Promise<AiDraftResult>;
}

export const AI_GENERATION_STATUSES = [
  "drafted",
  "accepted",
  "rejected",
] as const;
export type AiGenerationStatus = (typeof AI_GENERATION_STATUSES)[number];

export interface AiGenerationRecord {
  id: string;
  owner_id: string;
  content_item_id: string | null;
  platform_variant_id: string | null;
  generation_type: AiGenerationType;
  provider: string;
  model: string;
  prompt_template_version: string;
  scripture_reference: string | null;
  output: Record<string, unknown>;
  status: AiGenerationStatus;
  accepted_target_kind:
    "script_revision" | "platform_variant" | "planner_item" | null;
  accepted_target_id: string | null;
  created_at: string;
  decided_at: string | null;
}

/**
 * Validate a provider's output against the closed schema for its type.
 *
 * Returns the parsed value or null. This runs even when the provider
 * enforced the schema server-side — defence in depth is cheap here, and this
 * is the boundary that keeps "AI returned Scripture" impossible to store.
 */
export function validateAiOutput(
  type: AiGenerationType,
  output: unknown,
): Record<string, unknown> | null {
  const parsed = AI_OUTPUT_SCHEMAS[type].safeParse(output);
  return parsed.success ? (parsed.data as Record<string, unknown>) : null;
}
