import { INSTAGRAM_LIMITS } from "@/lib/instagram/config";
import { YOUTUBE_LIMITS } from "@/lib/youtube/config";

import type { AiDraftRequest, AiGenerationType } from "./types";

/**
 * Prompt assembly.
 *
 * Versioned so provenance can say exactly which template produced a draft.
 * The Scripture block is injected **separately** from the instruction text,
 * marked read-only, and the system prompt states the immutability rule in
 * terms the schema then enforces: there is no Scripture field to fill.
 */

export const PROMPT_TEMPLATE_VERSION = "stage11-v1";

export const AI_SYSTEM_PROMPT = `You draft content for Precious Promises, a Christian ministry sharing the promises of God.

Rules that are not negotiable:
- Any Scripture passage provided to you is VERIFIED, READ-ONLY INPUT. Never alter, paraphrase, extend, or re-quote it as output. Never produce verse text or Scripture citations of your own — if a draft would benefit from quoting Scripture, refer to the provided reference by name instead of quoting.
- Your output fields are drafts of generated content (scripts, prayers, declarations, commentary, captions, titles). They are not Scripture and must never claim to be.
- Never promise guaranteed outcomes: no guaranteed healing, wealth, breakthrough, or results. Speak of what God's word says and invites, not of guarantees this ministry cannot make.
- Keep the tone warm, reverent, and plain. British English.
- Return only the JSON object the schema requires.`;

function scriptureBlock(request: AiDraftRequest): string {
  if (request.scripture === null) {
    return "No Scripture passage is attached to this content.";
  }
  return [
    "VERIFIED SCRIPTURE (read-only input — do not alter, re-quote, or reproduce as output):",
    `Reference: ${request.scripture.reference}`,
    `Translation: ${request.scripture.translation}`,
    `Text: ${request.scripture.text}`,
  ].join("\n");
}

function platformLimits(request: AiDraftRequest): string {
  if (request.platform === "youtube") {
    if (request.type === "title") {
      return `The title must be at most ${YOUTUBE_LIMITS.titleCharacters} characters and must not contain < or >.`;
    }
    if (request.type === "description") {
      return `The description must fit within ${YOUTUBE_LIMITS.descriptionBytes} bytes and must not contain < or >.`;
    }
  }
  if (request.platform === "instagram" && request.type === "caption") {
    return `The caption must be at most ${INSTAGRAM_LIMITS.captionCharacters} characters and use at most ${INSTAGRAM_LIMITS.hashtags} hashtags.`;
  }
  return "";
}

const TYPE_INSTRUCTIONS: Record<AiGenerationType, string> = {
  script_draft:
    "Draft a video script as sections: hook, explanation, declaration, prayer, outro. The explanation is commentary in the ministry's voice; the declaration and prayer are the ministry's own words, never Scripture.",
  script_shorten:
    "Shorten the provided script while keeping its heart. Return only the sections you rewrote.",
  commentary_expand:
    "Expand the commentary (explanation section) with more depth and warmth.",
  short_conversion:
    "Convert the provided long-form script into a short-form version: a sharp hook, a compact explanation, a brief outro.",
  prayer: "Write a prayer in the ministry's own words.",
  declaration:
    "Write a declaration in the ministry's own words — a faith-filled statement, clearly not a Bible quotation.",
  title: "Draft one title.",
  description: "Draft one description.",
  caption: "Draft one caption.",
  hashtags: "Suggest hashtags as an array, without the # symbol.",
  cta: "Draft one short call to action.",
  plan_note:
    "Rephrase or expand the provided plan note. Do not invent evidence, figures, or performance claims that are not in the material provided.",
};

export function buildPrompt(request: AiDraftRequest): string {
  const parts = [
    scriptureBlock(request),
    request.workingMaterial
      ? `EXISTING MATERIAL:\n${request.workingMaterial}`
      : "",
    `TASK: ${TYPE_INSTRUCTIONS[request.type]}`,
    platformLimits(request),
    request.instruction.trim() !== ""
      ? `THE OWNER'S REQUEST: ${request.instruction.trim()}`
      : "",
  ];

  return parts.filter((part) => part !== "").join("\n\n");
}
