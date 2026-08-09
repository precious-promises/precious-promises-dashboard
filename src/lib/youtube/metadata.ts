import type { ContentItem } from "@/lib/content/types";
import type { ReadinessProblem } from "@/lib/publishing/providers";
import type { PlatformVariant } from "@/lib/variants/types";

import {
  FORBIDDEN_TEXT_CHARACTERS,
  YOUTUBE_LIMITS,
  isRequestablePrivacy,
} from "./config";
import type { VideoResource, YouTubeVideoMetadata } from "./types";

/**
 * Turning stored content into a YouTube video resource.
 *
 * Pure functions, so every mapping and every refusal can be tested without a
 * network, an account or a credential. The provider's only job is to send what
 * this module produced.
 *
 * Two rules shape all of it:
 *
 * 1. **Scripture is not a caption.** The verse text belongs to the content
 *    item and is verified there. It is included in a description only through
 *    the explicit, labelled path below — never merged into the caption, never
 *    reworded, never reconstructed.
 * 2. **Nothing is invented.** A missing title is a refusal, not a generated
 *    one. A title YouTube would reject is caught here, before an upload is
 *    sent, rather than after the bytes have gone.
 */

/** UTF-8 byte length, which is what YouTube measures a description in. */
export function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** The combined length YouTube counts tags against. */
export function tagsLength(tags: readonly string[]): number {
  return tags.join("").length;
}

/**
 * The description sent to YouTube.
 *
 * Assembled from named parts in a fixed order, each separated by a blank line,
 * so the result is reproducible and the Scripture block stays visually and
 * structurally distinct from the commentary around it. Empty parts are
 * dropped rather than left as stray blank lines.
 *
 * The Scripture block quotes the stored, verified text and its reference
 * exactly. It is not paraphrased, re-punctuated or trimmed.
 */
export function buildDescription(
  variant: Pick<PlatformVariant, "description" | "caption" | "cta">,
  item: Pick<
    ContentItem,
    "scripture_reference" | "scripture_text" | "scripture_translation"
  >,
  options: { includeScripture: boolean } = { includeScripture: true },
): string {
  const parts: string[] = [];

  const body = (variant.description ?? variant.caption ?? "").trim();
  if (body !== "") {
    parts.push(body);
  }

  if (options.includeScripture) {
    const scripture = scriptureBlock(item);
    if (scripture !== null) {
      parts.push(scripture);
    }
  }

  const cta = (variant.cta ?? "").trim();
  if (cta !== "") {
    parts.push(cta);
  }

  return parts.join("\n\n");
}

/**
 * The Scripture block, or `null` when there is no Scripture.
 *
 * Reference and translation are appended as an attribution line, not folded
 * into the verse text. A reader — and anyone auditing this later — can tell
 * exactly where the verified text ends.
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
    // A reference with no stored text is quoted as a reference only. Filling
    // in the verse from memory is exactly what this project forbids.
    return item.scripture_translation
      ? `${reference} (${item.scripture_translation})`
      : reference;
  }

  const attribution = [reference, item.scripture_translation]
    .filter((part) => (part ?? "").trim() !== "")
    .join(" ");

  return attribution === "" ? text : `${text}\n— ${attribution}`;
}

/**
 * Everything wrong with this content, as YouTube would see it.
 *
 * Returns problems rather than throwing so the interface can show all of them
 * at once. An owner fixing four things one upload at a time is four failed
 * uploads.
 */
export function validateForYouTube(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: YouTubeVideoMetadata | null;
}): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  const { variant, item, metadata } = input;

  const title = (variant.title ?? "").trim();

  if (title === "") {
    problems.push({
      code: "invalid_content",
      message: "This variant has no title, and YouTube requires one.",
    });
  } else if (title.length > YOUTUBE_LIMITS.titleCharacters) {
    problems.push({
      code: "invalid_content",
      message: `The title is ${title.length} characters; YouTube allows ${YOUTUBE_LIMITS.titleCharacters}.`,
    });
  }

  if (FORBIDDEN_TEXT_CHARACTERS.test(title)) {
    problems.push({
      code: "invalid_content",
      message: "The title contains < or >, which YouTube rejects.",
    });
  }

  const description = buildDescription(variant, item);
  const descriptionBytes = byteLength(description);

  if (descriptionBytes > YOUTUBE_LIMITS.descriptionBytes) {
    problems.push({
      code: "invalid_content",
      message: `The description is ${descriptionBytes} bytes; YouTube allows ${YOUTUBE_LIMITS.descriptionBytes}. Emoji and accented characters cost more than one byte each.`,
    });
  }

  if (FORBIDDEN_TEXT_CHARACTERS.test(description)) {
    problems.push({
      code: "invalid_content",
      message: "The description contains < or >, which YouTube rejects.",
    });
  }

  if (metadata === null) {
    problems.push({
      code: "invalid_content",
      message:
        "No YouTube settings have been saved for this variant. The made-for-kids declaration is required before anything can be uploaded.",
    });
    return problems;
  }

  const tags = metadata.tags ?? [];
  if (tagsLength(tags) > YOUTUBE_LIMITS.tagsTotalCharacters) {
    problems.push({
      code: "invalid_content",
      message: `The tags total ${tagsLength(tags)} characters; YouTube allows ${YOUTUBE_LIMITS.tagsTotalCharacters} across all of them.`,
    });
  }

  // A legal declaration with no default. An upload without an answer would be
  // this system answering on Dave's behalf.
  if (metadata.self_declared_made_for_kids === null) {
    problems.push({
      code: "invalid_content",
      message:
        "The made-for-kids declaration has not been answered. YouTube requires it on every upload, and it is a legal declaration this system will not answer for you.",
    });
  }

  if (!isRequestablePrivacy(metadata.privacy_status)) {
    problems.push({
      code: "invalid_content",
      message:
        "This API client has not passed Google's compliance audit, so an upload cannot be made public. YouTube would force it back to private.",
    });
  }

  return problems;
}

/**
 * Build the `videos.insert` request body.
 *
 * Called only after `validateForYouTube` returned nothing, and it re-checks
 * the one thing that would otherwise be silently guessed: the made-for-kids
 * declaration. There is no `?? false` anywhere in this function, because a
 * default there is an answer nobody gave.
 */
export function buildVideoResource(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: YouTubeVideoMetadata;
}): VideoResource {
  const { variant, item, metadata } = input;

  if (metadata.self_declared_made_for_kids === null) {
    throw new Error(
      "Refusing to build an upload without the made-for-kids declaration.",
    );
  }

  const title = (variant.title ?? "").trim();
  if (title === "") {
    throw new Error("Refusing to build an upload with no title.");
  }

  const resource: VideoResource = {
    snippet: {
      title,
      description: buildDescription(variant, item),
    },
    status: {
      privacyStatus: metadata.privacy_status,
      selfDeclaredMadeForKids: metadata.self_declared_made_for_kids,
      containsSyntheticMedia: metadata.contains_synthetic_media,
    },
  };

  const tags = (metadata.tags ?? []).filter((tag) => tag.trim() !== "");
  if (tags.length > 0) {
    resource.snippet.tags = tags;
  }
  if (metadata.category_id) {
    resource.snippet.categoryId = metadata.category_id;
  }
  if (metadata.default_language) {
    resource.snippet.defaultLanguage = metadata.default_language;
  }
  if (metadata.default_audio_language) {
    resource.snippet.defaultAudioLanguage = metadata.default_audio_language;
  }

  return resource;
}

/**
 * The YouTube settings, canonicalised for the approval fingerprint.
 *
 * These change what an audience sees — a privacy status, a thumbnail, a
 * made-for-kids declaration — so an approval granted before they were changed
 * no longer describes what would be published. Feeding this into the
 * fingerprint is what makes editing them invalidate the approval, exactly as
 * editing a caption does.
 *
 * The field list is written out in a fixed order for the same reason
 * `FIELD_ORDER` is: adding a field must be a deliberate edit, and the order
 * must never shift under a refactor and silently void every approval.
 *
 * Returns `null` when nothing has been saved, so saving settings for the first
 * time is itself a change.
 */
export function youtubeSettingsDigest(
  metadata: YouTubeVideoMetadata | null,
): string | null {
  if (metadata === null) {
    return null;
  }

  return [
    `privacy=${metadata.privacy_status}`,
    `kids=${metadata.self_declared_made_for_kids ?? "unanswered"}`,
    `synthetic=${metadata.contains_synthetic_media}`,
    `notify=${metadata.notify_subscribers}`,
    `category=${metadata.category_id ?? ""}`,
    `language=${metadata.default_language ?? ""}`,
    `audioLanguage=${metadata.default_audio_language ?? ""}`,
    `tags=[${[...(metadata.tags ?? [])].join("|")}]`,
    `playlist=${metadata.playlist_id ?? ""}`,
    `thumbnail=${metadata.thumbnail_media_asset_id ?? ""}`,
  ].join(";");
}

/**
 * The metadata a variant has before anything is saved.
 *
 * Note what is **not** defaulted: `self_declared_made_for_kids` stays `null`.
 * Every other field has a safe default; that one has no safe default, only an
 * unanswered question.
 */
export function defaultMetadataFor(
  ownerId: string,
  platformVariantId: string,
): Omit<YouTubeVideoMetadata, "id" | "created_at" | "updated_at"> {
  return {
    owner_id: ownerId,
    platform_variant_id: platformVariantId,
    category_id: null,
    default_language: null,
    default_audio_language: null,
    tags: [],
    privacy_status: "private",
    self_declared_made_for_kids: null,
    contains_synthetic_media: false,
    notify_subscribers: true,
    playlist_id: null,
    thumbnail_media_asset_id: null,
  };
}
