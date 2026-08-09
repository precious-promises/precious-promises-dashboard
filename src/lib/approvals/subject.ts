import type { ContentItem } from "@/lib/content/types";
import type { PlatformVariant } from "@/lib/variants/types";

import type { ApprovalMediaSelection, ApprovalSubject } from "./fingerprint";

/**
 * Assembling what an approval is *about*.
 *
 * Kept separate from `fingerprint.ts` so it stays pure — no `node:crypto`, no
 * database — and can be exercised directly in tests. The rule it encodes is
 * that a subject is built from **stored records only**: every field here comes
 * from a row, never from a submitted form.
 */
export function approvalSubjectFrom(
  variant: Pick<
    PlatformVariant,
    | "platform"
    | "variant_type"
    | "title"
    | "caption"
    | "description"
    | "hashtags"
    | "first_comment"
    | "cta"
    | "thumbnail_text"
    | "content_item_id"
  >,
  item: Pick<
    ContentItem,
    | "scripture_reference"
    | "scripture_text"
    | "scripture_translation"
    | "scripture_verification_status"
  >,
  video: { id: string; current_revision: number } | null,
  mediaSelections: ApprovalMediaSelection[],
  /**
   * The platform's own settings, already canonicalised by that platform's
   * module. Required rather than defaulted: a default would let one call site
   * quietly omit it and compute a fingerprint that never matches the one
   * approval was granted under.
   */
  platformSettings: string | null,
): ApprovalSubject {
  return {
    contentItemId: variant.content_item_id,

    scriptureReference: item.scripture_reference,
    scriptureText: item.scripture_text,
    scriptureTranslation: item.scripture_translation,
    scriptureVerificationStatus: item.scripture_verification_status,

    platform: variant.platform,
    variantType: variant.variant_type,

    title: variant.title,
    caption: variant.caption,
    description: variant.description,
    hashtags: variant.hashtags,
    firstComment: variant.first_comment,
    cta: variant.cta,
    thumbnailText: variant.thumbnail_text,

    videoProjectId: video?.id ?? null,
    videoProjectRevision: video?.current_revision ?? null,

    mediaSelections,

    platformSettings,
  };
}
