import type { ContentItem } from "@/lib/content/types";
import type { ReadinessProblem } from "@/lib/publishing/providers";
import type { PlatformVariant } from "@/lib/variants/types";

import {
  CAPTION_WARNING_CHARACTERS,
  DELIVERY_MODE_LABELS,
  type DeliveryMode,
  type PrivacyLevel,
} from "./config";
import type { CreatorInfo, TikTokVideoMetadata } from "./types";

/**
 * Turning stored content into a TikTok caption and settings.
 *
 * Pure functions, testable without a network or an account. The same two rules
 * as YouTube's and Instagram's govern them: **Scripture stays distinguishable
 * from commentary**, and **nothing is invented** — a missing caption is a
 * refusal, not a generated one.
 */

/**
 * The caption TikTok calls `title`.
 *
 * Assembled from named parts in a fixed order, separated by blank lines, so the
 * Scripture block stays visually and structurally distinct from the commentary
 * around it. Hashtags go last, where a reader expects them.
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
 * A reference with no stored text is quoted as a reference only. Filling in the
 * verse from memory is exactly what this project forbids.
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

// ---------------------------------------------------------------------------
// What the creator is actually allowed to do
// ---------------------------------------------------------------------------

/**
 * Whether a stored privacy level is one TikTok currently offers this creator.
 *
 * The check is deliberately positive: a level is usable only if TikTok named
 * it. A saved choice can stop being valid — an account switching to private,
 * or a client that has not passed audit — and this is what catches it before an
 * upload fails halfway.
 */
export function privacyLevelAllowed(
  privacyLevel: PrivacyLevel | null,
  creator: CreatorInfo,
): boolean {
  return (
    privacyLevel !== null && creator.privacyLevelOptions.includes(privacyLevel)
  );
}

/**
 * Everything wrong with these settings, given what TikTok says about this
 * creator.
 *
 * Kept separate from `validateForTikTok` because it needs a live API call, and
 * the content checks must work without one.
 */
export function validateAgainstCreator(
  metadata: TikTokVideoMetadata,
  creator: CreatorInfo,
): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];

  if (metadata.delivery_mode !== "direct_post") {
    // Privacy and interaction settings belong to the post, and an inbox upload
    // is not one — the creator chooses them in the TikTok app.
    return problems;
  }

  if (!privacyLevelAllowed(metadata.privacy_level, creator)) {
    problems.push({
      code: "invalid_content",
      message:
        metadata.privacy_level === null
          ? "No audience has been chosen for this TikTok post. TikTok requires one, and this application will not choose it for you."
          : `TikTok does not currently offer "${metadata.privacy_level}" for this account. Choose from the options TikTok returned and save again.`,
    });
  }

  // TikTok refuses a request that enables an interaction the creator has turned
  // off at account level. Sending it anyway would fail at the last step, after
  // the whole video had been uploaded.
  if (creator.commentDisabled && !metadata.disable_comment) {
    problems.push({
      code: "invalid_content",
      message:
        "This TikTok account has comments switched off, so the post cannot enable them.",
    });
  }
  if (creator.duetDisabled && !metadata.disable_duet) {
    problems.push({
      code: "invalid_content",
      message:
        "This TikTok account has Duet switched off, so the post cannot enable it.",
    });
  }
  if (creator.stitchDisabled && !metadata.disable_stitch) {
    problems.push({
      code: "invalid_content",
      message:
        "This TikTok account has Stitch switched off, so the post cannot enable it.",
    });
  }

  // TikTok's own rule, enforced here so it surfaces before the upload rather
  // than after it.
  if (metadata.is_branded_content && metadata.privacy_level === "SELF_ONLY") {
    problems.push({
      code: "invalid_content",
      message:
        "Branded content cannot be posted privately. Either remove the branded-content declaration or choose a wider audience.",
    });
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Content validation
// ---------------------------------------------------------------------------

/**
 * Everything wrong with this content, as far as can be known without calling
 * TikTok.
 *
 * Returns every problem rather than the first, so the owner fixes them in one
 * pass instead of discovering them one failed publish at a time.
 */
export function validateForTikTok(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: TikTokVideoMetadata | null;
}): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  const { variant, item, metadata } = input;

  if (metadata === null) {
    problems.push({
      code: "invalid_content",
      message:
        "No TikTok settings have been saved for this variant, so there is no audience or delivery mode to publish with.",
    });
    return problems;
  }

  const caption = buildCaption(variant, item);

  if (caption.trim() === "") {
    problems.push({
      code: "invalid_content",
      message:
        "This variant has no caption, description or Scripture, so there is nothing to post.",
    });
  }

  if (caption.length > CAPTION_WARNING_CHARACTERS) {
    problems.push({
      code: "invalid_content",
      message: `The caption is ${caption.length} characters, which is longer than the ${CAPTION_WARNING_CHARACTERS} TikTok is documented to accept.`,
    });
  }

  if (metadata.delivery_mode === "direct_post" && !metadata.privacy_level) {
    problems.push({
      code: "invalid_content",
      message:
        "A direct TikTok post needs an audience, and none has been chosen.",
    });
  }

  if (
    !metadata.is_commercial_content &&
    (metadata.is_branded_content || metadata.is_your_brand)
  ) {
    problems.push({
      code: "invalid_content",
      message:
        "A brand declaration was set without the commercial-content disclosure. Both or neither.",
    });
  }

  return problems;
}

/**
 * The TikTok settings, canonicalised for the approval fingerprint.
 *
 * Every field here changes what an audience sees or what is legally declared
 * about the post, so an approval granted before any of them changed no longer
 * describes what would be published. `null` when nothing is saved, so saving
 * for the first time is itself a change.
 *
 * The delivery mode is included deliberately. Switching from a draft upload to
 * a direct post is the single largest change that can be made to an approved
 * item — it is the difference between something Dave still has to publish and
 * something this system publishes for him.
 *
 * The field list is fixed and written out for the same reason the others are:
 * adding a field must be a deliberate edit, and the order must never shift
 * under a refactor and silently void every approval.
 */
export function tiktokSettingsDigest(
  metadata: TikTokVideoMetadata | null,
): string | null {
  if (metadata === null) {
    return null;
  }

  return [
    `delivery=${metadata.delivery_mode}`,
    `privacy=${metadata.privacy_level ?? ""}`,
    `comment=${metadata.disable_comment}`,
    `duet=${metadata.disable_duet}`,
    `stitch=${metadata.disable_stitch}`,
    `commercial=${metadata.is_commercial_content}`,
    `branded=${metadata.is_branded_content}`,
    `yourBrand=${metadata.is_your_brand}`,
  ].join(";");
}

/**
 * The settings a new variant starts with.
 *
 * `privacy_level` is `null` and `delivery_mode` is `inbox`, both on purpose.
 * The safest default is the one that cannot post anything: a draft upload the
 * owner finishes in the TikTok app. Defaulting to a direct post — or to any
 * audience at all — would be this application deciding to publish.
 */
export function defaultTikTokMetadata(
  ownerId: string,
  platformVariantId: string,
): Omit<TikTokVideoMetadata, "id" | "created_at" | "updated_at"> {
  return {
    owner_id: ownerId,
    platform_variant_id: platformVariantId,
    privacy_level: null,
    disable_comment: false,
    disable_duet: false,
    disable_stitch: false,
    is_commercial_content: false,
    is_branded_content: false,
    is_your_brand: false,
    delivery_mode: "inbox",
  };
}

/** What the interface tells the owner will happen, in plain words. */
export function describeDelivery(mode: DeliveryMode): string {
  return DELIVERY_MODE_LABELS[mode];
}
