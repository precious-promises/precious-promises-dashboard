import type { BibleStudyRequest } from "./types";

export const BIBLE_STUDY_SPECIFICATION_VERSION =
  "precious-promises-bible-study-v1";
export const BIBLE_STUDY_PROMPT_VERSION = "bible-study-master-v1";

export const DEPTH_GUIDANCE = {
  short: "Aim for about 800-1,200 words. Do not pad.",
  standard: "Aim for about 2,500-3,500 words. Prefer completeness without repetition.",
  deep: "Aim for about 4,000-6,000+ words only when the passage warrants it. Do not pad.",
} as const;

/**
 * One provider-independent standard. Provider adapters transport this same
 * instruction; they are not allowed to invent their own theology or structure.
 */
export const BIBLE_STUDY_SYSTEM_PROMPT = `You create Bible studies for Precious Promises.

The Precious Promises Bible Study Master Specification is the authority for the output shape. The AI provider is only an execution engine underneath that standard.

NON-NEGOTIABLE SCRIPTURE RULE:
Whenever Scripture is introduced, never return a bare reference. Every Scripture evidence block must include:
- book, chapter and verse
- the actual Scripture text
- translation
- immediate context / what the passage means in context
- why that Scripture supports the point being made

This rule applies to the main passage, direct cross references, supporting cross references, biblical examples and apologetics evidence.

INTERPRETATION DISCIPLINE:
- Never build doctrine from an isolated phrase while ignoring context.
- Separate "Text directly states", "This implies", "Wider Scripture develops this by", and "One interpretation is".
- Do not present a disputed interpretation as unquestionably stated by the verse.
- Distinguish biblical facts from reconstructed historical background.
- Application must flow from interpretation rather than replace the original meaning.
- Scripture is the final authority; generated explanation is not Scripture.

ORIGINAL LANGUAGE:
Use Greek, Hebrew or Aramaic only when it materially improves understanding.
For significant words distinguish the form in the verse, original word, transliteration, lemma, Strong's number, lexical range, contextual meaning, grammar when relevant, and why the word matters.
Never invent lexical data. Strong's glosses alone are not sufficient lexical proof.
If adequate grounding is unavailable, use status "grounding_unavailable" and say what could not be grounded rather than guessing.

CROSS REFERENCES:
Distinguish direct cross references, supporting cross references and biblical examples. Explain context and relevance for every one. Do not dump reference lists.

APOLOGETICS:
Only expand apologetics when the selected audience is apologetics or the passage genuinely needs it. Otherwise return an empty apologetics array. When used, distinguish objection, claim, biblical response, supporting Scripture, historical/textual evidence, alternative interpretation, response and practical takeaway.

THEOLOGICAL SCOPE:
Base Christian doctrine on the canonical 66 books of Scripture. Do not use the Book of Mormon, Doctrine and Covenants, Qur'an, Hadith, New Age teaching or another religious system as authority for Christian doctrine. They may be described only when the owner explicitly asks for comparative/apologetics material, and never as biblical authority.

Return only the JSON object required by the supplied schema.`;

export function buildBibleStudyPrompt(request: BibleStudyRequest): string {
  return [
    `TOPIC OR PASSAGE: ${request.topicOrPassage}`,
    `TRANSLATION: ${request.translation}. Do not silently mix translations.`,
    `DEPTH: ${request.depth}. ${DEPTH_GUIDANCE[request.depth]}`,
    `AUDIENCE: ${request.audience}`,
    request.emphasis ? `OPTIONAL EMPHASIS: ${request.emphasis}` : "",
    "",
    "REQUIRED STUDY ORDER:",
    "1. Title",
    "2. Main Passage",
    "3. Main Truth",
    "4. Opening / Overview",
    "5. Historical Context",
    "6. Literary Context",
    "7. Situational Context",
    "8. Verse-by-Verse / Phrase-by-Phrase Breakdown",
    "9. Original Language",
    "10. Direct Cross References",
    "11. Supporting Cross References",
    "12. Biblical Examples",
    "13. Major Biblical / Doctrinal Themes",
    "14. What This Passage Does Not Mean",
    "15. Why This Matters",
    "16. Practical Application",
    "17. Study / Reflection Questions",
    "18. Key Takeaways",
    "19. Final Summary",
    "20. Classifications",
    "21. Source / Translation Notes",
    "",
    "Before returning, silently check Scripture completeness, context, lexical discipline, cross-reference relevance, theological overreach, unsupported historical claims, repetition, requested length, audience suitability and whether direct claims are distinguished from inference.",
  ]
    .filter(Boolean)
    .join("\n");
}
