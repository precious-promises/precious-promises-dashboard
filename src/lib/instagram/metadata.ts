import type { ContentItem } from "@/lib/content/types";
import type { ReadinessProblem } from "@/lib/publishing/providers";
import type { PlatformVariant } from "@/lib/variants/types";

import {
  INSTAGRAM_LIMITS,
  MEDIA_DELIVERY,
  canPublishMediaType,
} from "./config";
import type { InstagramMediaMetadata } from "./types";

/**
 * Turning stored content into an Instagram caption and settings.
 *
 * Pure functions, testable without a network or an account. The same two rules
 * as YouTube govern them: **Scripture stays distinguishable from commentary**,
 * and **nothing is invented** — a missing caption is a refusal, not a
 * generated one.
 */

/**
 * The caption sent to Meta.
 *
 * Assembled from named parts in a fixed order, separated by blank lines, so
 * the Scripture block stays visually and structurally distinct from the
 * commentary around it. Hashtags go last, where a reader expects them.
 *
 * The Scripture text and its reference are quoted exactly as stored. They are
 * not paraphrased, re-punctuated or reconstructed.
 */
export function buildCaption(
  variant: Pick<
    PlatformVariant,
    "caption" | "description" | "cta" | "hashtags"
  >,
  item: Pick<
    ContentItem,
    "scripture_reference" | "scripture_text" | "scripture_translation"
  >,
): string {
  const parts: string[] = [];

  const body = (variant.caption ?? variant.description ?? "").trim();
  if (body !== "") {
    parts.push(body);
  }

  const scripture = scriptureBlock(item);
  if (scripture !== null) {
    parts.push(scripture);
  }

  const cta = (variant.cta ?? "").trim();
  if (cta !== "") {
    parts.push(cta);
  }

  const hashtags = (variant.hashtags ?? []).filter((tag) => tag.trim() !== "");
  if (hashtags.length > 0) {
    parts.push(hashtags.map((tag) => `#${tag}`).join(" "));
  }

  return parts.join("\n\n");
}

/**
 * The Scripture block, or `null` when there is none.
 *
 * A reference with no stored text is quoted as a reference only. Filling in
 * the verse from memory is exactly what this project forbids.
 */
export function scriptureBlock(
  item: Pick<
    ContentItem,
    "scripture_reference" | "scripture_text" | "scripture_translation"
  >,
): string | null {
  const text = (item.scripture_text ?? "").trim();
  const reference = (item.scripture_reference ?? "").trim();

  if (text === "" && reference === "") {
    return null;
  }

  if (text === "") {
    return item.scripture_translation
      ? `${reference} (${item.scripture_translation})`
      : reference;
  }

  const attribution = [reference, item.scripture_translation]
    .filter((part) => (part ?? "").trim() !== "")
    .join(" ");

  return attribution === "" ? text : `${text}\n— ${attribution}`;
}

/** How many hashtags a caption carries, counted the way Meta counts them. */
export function countHashtags(caption: string): number {
  return (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function countMentions(caption: string): number {
  return (caption.match(/@[\p{L}\p{N}_.]+/gu) ?? []).length;
}

/**
 * Everything wrong with this content, as Meta would see it.
 *
 * Returns every problem rather than the first, so the owner fixes them in one
 * pass instead of discovering them one failed publish at a time.
 */
export function validateForInstagram(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: InstagramMediaMetadata | null;
}): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  const { variant, item, metadata } = input;

  if (metadata === null) {
    problems.push({
      code: "invalid_content",
      message:
        "No Instagram settings have been saved for this variant, so there is no media type to publish as.",
    });
    return problems;
  }

  // The decisive one. Images and carousels are refused by design, not by
  // accident — see MEDIA_DELIVERY.
  if (!canPublishMediaType(metadata.media_type)) {
    problems.push({
      code: "media_source_unavailable",
      message: MEDIA_DELIVERY[metadata.media_type].detail,
    });
  }

  const caption = buildCaption(variant, item);

  if (caption.trim() === "") {
    problems.push({
      code: "invalid_content",
      message:
        "This variant has no caption, description or Scripture, so there is nothing to post.",
    });
  }

  if (caption.length > INSTAGRAM_LIMITS.captionCharacters) {
    problems.push({
      code: "invalid_content",
      message: `The caption is ${caption.length} characters; Instagram allows ${INSTAGRAM_LIMITS.captionCharacters}.`,
    });
  }

  const hashtags = countHashtags(caption);
  if (hashtags > INSTAGRAM_LIMITS.hashtags) {
    problems.push({
      code: "invalid_content",
      message: `The caption has ${hashtags} hashtags; Instagram allows ${INSTAGRAM_LIMITS.hashtags}.`,
    });
  }

  const mentions = countMentions(caption);
  if (mentions > INSTAGRAM_LIMITS.mentions) {
    problems.push({
      code: "invalid_content",
      message: `The caption has ${mentions} @ mentions; Instagram allows ${INSTAGRAM_LIMITS.mentions}.`,
    });
  }

  return problems;
}

/**
 * The Instagram settings, canonicalised for the approval fingerprint.
 *
 * The media type and the cover frame change what an audience sees, so an
 * approval granted before they changed no longer describes what would be
 * published. `null` when nothing is saved, so saving for the first time is
 * itself a change.
 *
 * The field list is fixed and written out for the same reason the YouTube one
 * is: adding a field must be a deliberate edit, and the order must never shift
 * under a refactor and silently void every approval.
 */
export function instagramSettingsDigest(
  metadata: InstagramMediaMetadata | null,
): string | null {
  if (metadata === null) {
    return null;
  }

  return [
    `mediaType=${metadata.media_type}`,
    `cover=${metadata.cover_media_asset_id ?? ""}`,
    `shareToFeed=${metadata.share_to_feed}`,
  ].join(";");
}

export function defaultInstagramMetadata(
  ownerId: string,
  platformVariantId: string,
): Omit<InstagramMediaMetadata, "id" | "created_at" | "updated_at"> {
  return {
    owner_id: ownerId,
    platform_variant_id: platformVariantId,
    // Reels is the only publishable type, so it is the only sensible default —
    // and the interface says why the others are there but refused.
    media_type: "reels",
    cover_media_asset_id: null,
    share_to_feed: true,
  };
}
