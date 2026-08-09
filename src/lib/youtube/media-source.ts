import type { MediaAsset, MediaType } from "@/lib/media/types";
import { safeError, type SafeError } from "@/lib/publishing/errors";

/**
 * Where the bytes of a video actually come from.
 *
 * **They do not, yet.** This is the honest centre of Stage 7, so it is worth
 * being precise about why.
 *
 * Stage 2 stores media as *metadata*: a `media_assets` row records a name, a
 * type, a size and an external id or URL for a file that lives somewhere else
 * — usually Google Drive. No Drive integration exists, no storage adapter is
 * implemented, and Stage 4's render pipeline produces a render *job*, not a
 * rendered file. So for every asset this system currently holds, there is a
 * record of a video and no way to obtain the video.
 *
 * A provider cannot upload a reference. Faced with that, there are two
 * options: report the truth, or invent a success. This module reports the
 * truth — `media_source_unavailable`, a non-retryable refusal — and the
 * publish stops there.
 *
 * **This is not a stub.** A stub would return plausible bytes and let an
 * upload appear to work. The refusal below is the actual state of the system,
 * and it will stop being returned when a storage integration genuinely lands,
 * not before.
 */

/**
 * A resolved, uploadable file.
 *
 * `open()` is a function rather than a buffer so a large video need not be
 * held in memory in one piece when a real source arrives.
 */
export interface MediaSource {
  contentType: string;
  contentLength: number;
  open(): Promise<BodyInit>;
}

export type MediaSourceResult =
  | { available: true; source: MediaSource }
  | { available: false; error: SafeError };

/**
 * Resolve the bytes for an asset, or explain why they cannot be resolved.
 *
 * Every branch returns `available: false` today. They are written out
 * separately anyway, because each one is a different missing piece of work and
 * a single blanket refusal would hide which one is blocking a given upload.
 */
export function resolveMediaSource(
  asset: MediaAsset | null,
  expected: MediaType = "video",
): MediaSourceResult {
  if (asset === null) {
    return {
      available: false,
      error: safeError(
        "missing_asset",
        "No media asset is attached to this content.",
      ),
    };
  }

  if (asset.media_type !== expected) {
    return {
      available: false,
      error: safeError(
        "missing_asset",
        `The attached asset is ${asset.media_type}, and ${expected} was expected.`,
      ),
    };
  }

  switch (asset.storage_provider) {
    case "google_drive":
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "This file is recorded as living in Google Drive, but no Drive integration exists to fetch it. The video cannot be uploaded until one does.",
        ),
      };

    case "supabase_storage":
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "This file is recorded as living in Supabase Storage, but no storage adapter is implemented to read it.",
        ),
      };

    case "external":
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "This file is a reference to somewhere outside this system. Nothing here fetches external files, so there are no bytes to upload.",
        ),
      };

    default:
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "The media file cannot be retrieved, so there is nothing to upload.",
        ),
      };
  }
}

/**
 * Whether any storage integration exists at all.
 *
 * A single place for the interface to ask, so the Connected Accounts page and
 * the Publish Queue say the same thing about the same limitation.
 */
export const MEDIA_RETRIEVAL_AVAILABLE = false;

export const MEDIA_RETRIEVAL_DETAIL =
  "Media is stored as metadata only: this system records where a file lives, but no integration retrieves it. Until one exists, a YouTube upload will refuse with media_source_unavailable rather than send an empty or invented file.";
