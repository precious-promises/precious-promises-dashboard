import { createHash } from "node:crypto";

import type { ScriptureVerificationStatus } from "@/lib/content/types";
import type { VariantPlatform, VariantType } from "@/lib/variants/types";

/**
 * The approval fingerprint.
 *
 * Approval attaches to **a specific version of specific wording**, not to the
 * row that holds it. This module reduces everything publication-sensitive
 * about one platform variant to a single SHA-256 string, so an approval can be
 * checked later rather than merely trusted.
 *
 * The rule it enforces: if what would be published has changed since approval,
 * the stored hash no longer matches and the approval is void. That check runs
 * in server code before scheduling — it is not a warning in the interface that
 * a determined click can walk past.
 *
 * **Server-only.** It imports `node:crypto`, so it must never be pulled into a
 * Client Component.
 */

/** One media selection on the content item. */
export interface ApprovalMediaSelection {
  mediaAssetId: string;
  purpose: string;
  sortOrder: number;
}

/**
 * Everything that decides what reaches an audience.
 *
 * Assembled on the server from real records — never from a form — so a
 * fingerprint always describes what is stored.
 */
export interface ApprovalSubject {
  contentItemId: string;

  // Scripture. The verification status is included deliberately: an approval
  // was granted against a *verified* verse, and if that verification lapses
  // the approval no longer describes the same thing.
  scriptureReference: string | null;
  scriptureText: string | null;
  scriptureTranslation: string;
  scriptureVerificationStatus: ScriptureVerificationStatus;

  platform: VariantPlatform;
  variantType: VariantType;

  title: string | null;
  caption: string | null;
  description: string | null;
  hashtags: string[];
  firstComment: string | null;
  cta: string | null;
  thumbnailText: string | null;

  // The video selected for this content, and which revision of it. A recut
  // composition is different content even when the caption is identical.
  videoProjectId: string | null;
  videoProjectRevision: number | null;

  mediaSelections: ApprovalMediaSelection[];

  /**
   * Platform-specific publishing settings, canonicalised by the platform.
   *
   * Added in Stage 7, when settings that genuinely change what an audience
   * sees stopped being hypothetical: a YouTube variant carries a privacy
   * status, a made-for-kids declaration, tags and a thumbnail. Approving a
   * variant and then flipping its privacy or swapping its thumbnail would
   * otherwise publish something nobody approved.
   *
   * `null` for a platform with no such settings, and for a YouTube variant
   * with none saved yet — so saving them for the first time correctly
   * invalidates an approval granted before they existed.
   */
  platformSettings: string | null;
}

/**
 * The fields, in a fixed order.
 *
 * Written out rather than derived from `Object.keys`, so adding a
 * publication-sensitive field is a deliberate edit here — and so the order can
 * never shift with a refactor and silently invalidate every existing approval.
 */
const FIELD_ORDER = [
  "contentItemId",
  "scriptureReference",
  "scriptureText",
  "scriptureTranslation",
  "scriptureVerificationStatus",
  "platform",
  "variantType",
  "title",
  "caption",
  "description",
  "hashtags",
  "firstComment",
  "cta",
  "thumbnailText",
  "videoProjectId",
  "videoProjectRevision",
  "mediaSelections",
  "platformSettings",
] as const;

/**
 * What is deliberately **excluded**, and why.
 *
 * Exported so the reasoning is testable and reviewable rather than implicit:
 * a volatile value in the fingerprint would invalidate approvals for reasons
 * that have nothing to do with what gets published.
 */
export const EXCLUDED_FROM_FINGERPRINT = [
  "created_at",
  "updated_at",
  "approved_at",
  "approved_by",
  "rejected_at",
  "rejected_by",
  "rejection_reason",
  "review_state",
  "id",
  "owner_id",
] as const;

/**
 * Encode one value unambiguously.
 *
 * `null` and the empty string must not collide — an absent caption and a blank
 * one are different states — so every value carries a type tag.
 */
function encode(value: unknown): string {
  if (value === null || value === undefined) {
    return "~";
  }
  if (typeof value === "number") {
    return `n:${value}`;
  }
  if (typeof value === "boolean") {
    return `b:${value}`;
  }
  if (Array.isArray(value)) {
    return `a:[${value.map(encode).join(",")}]`;
  }
  return `s:${String(value)}`;
}

/**
 * Media selections, ordered deterministically.
 *
 * Sorted by the encoded triple so the fingerprint does not depend on the order
 * the database happened to return rows in — while still covering `sortOrder`
 * and `purpose`, both of which change what is published.
 */
function encodeMedia(selections: ApprovalMediaSelection[]): string {
  return selections
    .map(
      (selection) =>
        `${selection.purpose}|${selection.sortOrder}|${selection.mediaAssetId}`,
    )
    .sort()
    .join(",");
}

/**
 * The canonical string a fingerprint is taken over.
 *
 * Exported because a hash is opaque when a test fails: comparing canonical
 * strings says *which* field moved.
 */
export function canonicaliseApprovalSubject(subject: ApprovalSubject): string {
  return FIELD_ORDER.map((field) => {
    const value =
      field === "mediaSelections"
        ? encodeMedia(subject.mediaSelections)
        : encode(subject[field]);
    return `${field}=${value}`;
  }).join("");
}

/** SHA-256 of the canonical form, lowercase hex. */
export function approvalFingerprint(subject: ApprovalSubject): string {
  return createHash("sha256")
    .update(canonicaliseApprovalSubject(subject), "utf8")
    .digest("hex");
}

/**
 * Whether a stored approval still describes the current content.
 *
 * A missing stored hash is **not** a match. An approval with nothing to
 * compare against cannot be shown to be valid, and treating "unknown" as
 * "fine" is how stale content reaches an audience.
 */
export function fingerprintMatches(
  storedHash: string | null,
  subject: ApprovalSubject,
): boolean {
  if (storedHash === null || storedHash === "") {
    return false;
  }
  return storedHash === approvalFingerprint(subject);
}
