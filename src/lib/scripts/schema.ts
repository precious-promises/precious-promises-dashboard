import { z } from "zod";

/**
 * Script revision validation.
 *
 * As everywhere else in this codebase, `owner_id` is absent by design — it
 * comes from the authenticated session. `content_item_id` is also absent:
 * it is a route parameter the server resolves and ownership-checks, not a
 * value the form gets to choose.
 *
 * There is deliberately no `scripture_text` or `scripture_reference` field.
 * A script cannot carry Scripture, so saving a script cannot alter it.
 */

const optionalProse = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

export const scriptRevisionSchema = z.object({
  hook: optionalProse(5000),
  explanation: optionalProse(20000),
  declaration: optionalProse(10000),
  prayer: optionalProse(10000),
  outro: optionalProse(5000),
  notes: optionalProse(10000),
});

export type ScriptRevisionValues = z.output<typeof scriptRevisionSchema>;

export type ScriptFieldErrors = Partial<
  Record<keyof ScriptRevisionValues, string>
>;

export type ScriptParseResult =
  | { success: true; data: ScriptRevisionValues }
  | { success: false; fieldErrors: ScriptFieldErrors };

export function parseScriptRevision(input: unknown): ScriptParseResult {
  const result = scriptRevisionSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: ScriptFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !(field in fieldErrors)) {
      (fieldErrors as Record<string, string>)[field] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}

/** Read a script revision out of a FormData payload. */
export function scriptValuesFrom(formData: FormData): unknown {
  return {
    hook: formData.get("hook"),
    explanation: formData.get("explanation"),
    declaration: formData.get("declaration"),
    prayer: formData.get("prayer"),
    outro: formData.get("outro"),
    notes: formData.get("notes"),
  };
}
