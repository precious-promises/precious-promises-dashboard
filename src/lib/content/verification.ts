import type { ScriptureVerificationStatus } from "./types";

/**
 * Scripture verification state transitions.
 *
 * The rule this file exists for:
 *
 *   **Editing the Scripture reference or text of a verified item invalidates
 *   that verification.**
 *
 * Verification attests to a specific wording of a specific reference. If either
 * changes, the earlier confirmation describes something that no longer exists —
 * so the item must go back to `verification_required` and be checked again.
 *
 * This lives here, as pure functions over plain values, rather than in a form
 * handler or a database trigger, because it is a domain rule and every write
 * path has to obey it. A UI-only version would be bypassed by the first server
 * action that forgot to call it.
 */

/** The Scripture fields whose change invalidates verification. */
export interface ScriptureFields {
  scripture_reference: string | null;
  scripture_text: string | null;
}

export interface VerificationState {
  scripture_verification_status: ScriptureVerificationStatus;
  scripture_verified_at: string | null;
  scripture_verified_by: string | null;
}

/**
 * Normalise for comparison.
 *
 * Trailing whitespace or a null/empty-string swap is not a change to the
 * Scripture, and re-verification should not be demanded for one. Anything
 * else — including a single altered word — is.
 */
function normalise(value: string | null): string {
  return (value ?? "").trim();
}

/** True when the reference or the text differs in a way that matters. */
export function scriptureChanged(
  previous: ScriptureFields,
  next: ScriptureFields,
): boolean {
  return (
    normalise(previous.scripture_reference) !==
      normalise(next.scripture_reference) ||
    normalise(previous.scripture_text) !== normalise(next.scripture_text)
  );
}

/**
 * Decide the verification state an edit should produce.
 *
 * - Verified item, Scripture changed → `verification_required`, and the
 *   verification metadata is cleared, because it referred to the old wording.
 * - Verified item, Scripture unchanged → verification survives intact. Editing
 *   a title or description says nothing about the verse.
 * - Never-verified item → stays where it was. An edit cannot make unverified
 *   Scripture more suspect than it already was.
 */
export function resolveVerificationAfterEdit(
  current: VerificationState,
  previous: ScriptureFields,
  next: ScriptureFields,
): VerificationState {
  if (!scriptureChanged(previous, next)) {
    return current;
  }

  if (current.scripture_verification_status === "manually_verified") {
    return {
      scripture_verification_status: "verification_required",
      scripture_verified_at: null,
      scripture_verified_by: null,
    };
  }

  return current;
}

/** The state produced by a human confirming the Scripture. */
export function markManuallyVerified(
  verifiedBy: string,
  verifiedAt: string,
): VerificationState {
  return {
    scripture_verification_status: "manually_verified",
    scripture_verified_at: verifiedAt,
    scripture_verified_by: verifiedBy,
  };
}

/**
 * Whether an item can be manually verified right now.
 *
 * There must be something to verify: confirming an empty Scripture field would
 * record an assertion about nothing.
 */
export function canManuallyVerify(fields: ScriptureFields): boolean {
  return normalise(fields.scripture_reference) !== "";
}
