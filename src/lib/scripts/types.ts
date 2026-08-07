/**
 * Script domain vocabulary.
 *
 * A script revision holds prose a human wrote. It has no Scripture column, by
 * design — Scripture lives on `content_items` and is displayed read-only
 * beside the script. That separation is structural: a script field cannot
 * carry a verse, so writing a script cannot alter one.
 */

/** The written sections of a script, in the order they are presented. */
export const SCRIPT_SECTIONS = [
  "hook",
  "explanation",
  "declaration",
  "prayer",
  "outro",
  "notes",
] as const;

export type ScriptSection = (typeof SCRIPT_SECTIONS)[number];

export const SCRIPT_SECTION_LABELS: Record<ScriptSection, string> = {
  hook: "Hook",
  explanation: "Explanation / Encouragement",
  declaration: "Declaration",
  prayer: "Prayer",
  outro: "Outro",
  notes: "Private notes",
};

/**
 * What each section is for.
 *
 * The declaration and prayer descriptions carry the rule that matters: these
 * are the owner's own words, not Scripture, and the interface must never
 * present them as Scripture.
 */
export const SCRIPT_SECTION_HINTS: Record<ScriptSection, string> = {
  hook: "The opening line that earns attention.",
  explanation: "Your teaching or encouragement in your own words.",
  declaration:
    "A declaration in your own words. This is not Scripture and is never presented as Scripture.",
  prayer:
    "A prayer in your own words. This is not Scripture and is never presented as Scripture.",
  outro: "How the piece closes.",
  notes: "Private working notes. Never published.",
};

/** Sections that are part of the spoken piece, as opposed to private notes. */
export const SPOKEN_SECTIONS = SCRIPT_SECTIONS.filter(
  (section) => section !== "notes",
);

export interface ScriptRevision {
  id: string;
  owner_id: string;
  content_item_id: string;
  revision_number: number;
  hook: string | null;
  explanation: string | null;
  declaration: string | null;
  prayer: string | null;
  outro: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * The revision number a new save should take.
 *
 * Revisions start at 1 and only ever increase. Passing the current latest —
 * or `null` when there is no script yet — makes this a pure function that can
 * be tested without a database.
 */
export function nextRevisionNumber(latest: number | null): number {
  if (latest === null || !Number.isFinite(latest) || latest < 1) {
    return 1;
  }
  return Math.floor(latest) + 1;
}

/** True when a revision has no written content at all. */
export function isEmptyRevision(
  values: Partial<Record<ScriptSection, string | null | undefined>>,
): boolean {
  return SCRIPT_SECTIONS.every(
    (section) => (values[section] ?? "").trim() === "",
  );
}
