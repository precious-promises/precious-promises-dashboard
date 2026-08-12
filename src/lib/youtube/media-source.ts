import { driveStorage } from "@/lib/drive/storage";
import { refusalMessage, type DriveRefusal } from "@/lib/drive/types";
import type { MediaAsset, MediaType } from "@/lib/media/types";
import {
  safeError,
  type ErrorCategory,
  type SafeError,
} from "@/lib/publishing/errors";

/**
 * Where the bytes of a video actually come from.
 *
 * **Stage 8 changed the answer.** Through Stage 7 this module refused
 * everything: media was stored as metadata describing a file held elsewhere,
 * and nothing could fetch it. Google Drive retrieval now exists, so an asset
 * whose file lives in the approved Precious Promises Content folder resolves
 * to real, streamable bytes.
 *
 * What has **not** changed is the shape of the refusals. Every other storage
 * provider still returns `media_source_unavailable`, because no adapter exists
 * for them — and inventing bytes remains the one thing this module will never
 * do. The difference between "no integration exists" and "this particular file
 * cannot be used" is now visible in the error code, which it was not before.
 */

/**
 * A resolved, uploadable file.
 *
 * `open()` returns a streaming `Response` body rather than a buffer, so a
 * large video is never held in memory in one piece.
 */
export interface MediaSource {
  contentType: string;
  contentLength: number;
  filename: string;
  open(): Promise<BodyInit>;
  /**
   * One inclusive byte range, for platforms that upload in chunks.
   *
   * Added in Stage 9 for TikTok, which asks for a specific slice and a
   * `Content-Range` naming it. Buffering the whole video to cut pieces out of
   * it would defeat the point of streaming in the first place.
   */
  openRange(start: number, end: number): Promise<BodyInit>;
}

export type MediaSourceResult =
  | { available: true; source: MediaSource }
  | { available: false; error: SafeError };

/**
 * Which refusals mean "this file is wrong" versus "nothing can fetch it".
 *
 * The distinction decides what the owner is being asked to do: swap the file,
 * or wait for an integration that does not exist.
 */
const REFUSAL_CATEGORIES: Record<DriveRefusal, ErrorCategory> = {
  not_connected: "provider_not_connected",
  not_configured: "provider_not_connected",
  outside_root: "missing_asset",
  not_found: "missing_asset",
  trashed: "missing_asset",
  is_folder: "missing_asset",
  unsupported_type: "invalid_content",
  no_size: "missing_asset",
  unreadable: "media_source_unavailable",
};

/**
 * Resolve the bytes for an asset, or explain why they cannot be resolved.
 *
 * Ownership is a required argument, not an assumption. The storage adapter
 * runs under the worker credential, which bypasses RLS, so the owner is proved
 * explicitly at every step.
 */
export async function resolveMediaSource(
  asset: MediaAsset | null,
  expected: MediaType = "video",
): Promise<MediaSourceResult> {
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
      return resolveFromDrive(asset);

    case "supabase_storage":
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "This file is recorded as living in Supabase Storage, and no adapter is implemented to read it.",
        ),
      };

    case "external":
      return {
        available: false,
        error: safeError(
          "media_source_unavailable",
          "This file is a reference to somewhere outside this system. Nothing here fetches arbitrary external URLs, and adding that would make this application a URL fetcher pointed at whatever a record contained.",
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

async function resolveFromDrive(asset: MediaAsset): Promise<MediaSourceResult> {
  if (!asset.external_file_id) {
    return {
      available: false,
      error: safeError(
        "missing_asset",
        "This asset is recorded as a Drive file but has no Drive id.",
      ),
    };
  }

  const resolved = await driveStorage.open(
    asset.external_file_id,
    asset.owner_id,
  );

  if (!resolved.ok) {
    return {
      available: false,
      error: safeError(
        REFUSAL_CATEGORIES[resolved.refusal],
        refusalMessage(resolved.refusal, resolved.detail),
      ),
    };
  }

  const media = resolved.value;

  return {
    available: true,
    source: {
      contentType: media.contentType,
      contentLength: media.contentLength,
      filename: media.filename,
      open: async () => {
        const response = await media.open();
        if (response.body === null) {
          throw new Error("Google Drive returned no body for that file.");
        }
        return response.body as unknown as BodyInit;
      },
      openRange: async (start: number, end: number) => {
        const response = await media.openRange(start, end);
        if (response.body === null) {
          throw new Error("Google Drive returned no body for that range.");
        }
        return response.body as unknown as BodyInit;
      },
    },
  };
}

/**
 * Whether any storage integration exists at all.
 *
 * True since Stage 8. It says an adapter is implemented — **not** that a
 * connection exists or that any particular file can be read, which are
 * runtime questions with their own answers.
 */
export const MEDIA_RETRIEVAL_AVAILABLE = true;

export const MEDIA_RETRIEVAL_DETAIL =
  "Media is retrieved from the approved Precious Promises Content folder in Google Drive. A file outside that folder, or in an unconnected provider, is refused rather than fetched.";
