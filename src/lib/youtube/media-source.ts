import { driveStorage } from "@/lib/drive/storage";
import { refusalMessage, type DriveRefusal } from "@/lib/drive/types";
import type { MediaAsset, MediaType } from "@/lib/media/types";
import {
  safeError,
  type ErrorCategory,
  type SafeError,
} from "@/lib/publishing/errors";
import {
  GENERATED_MEDIA_REFUSAL_MESSAGES,
  type GeneratedMediaRefusal,
} from "@/lib/storage/generated-config";
import { openGeneratedMedia } from "@/lib/storage/generated";
import { createWorkerClient } from "@/lib/supabase/worker";

/**
 * Where the bytes of a video actually come from.
 *
 * **Stage 8 changed the answer.** Through Stage 7 this module refused
 * everything: media was stored as metadata describing a file held elsewhere,
 * and nothing could fetch it. Google Drive retrieval now exists, so an asset
 * whose file lives in the approved Precious Promises Content folder resolves
 * to real, streamable bytes.
 *
 * **Stage 11 filled in the second adapter**: `supabase_storage`, the private
 * generated-media bucket this application renders and narrates into. Only
 * `external` remains a permanent refusal — inventing bytes, or fetching an
 * arbitrary URL a record happened to contain, are the two things this module
 * will never do. The difference between "no integration exists" and "this
 * particular file cannot be used" stays visible in the error code.
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
      return resolveFromGeneratedStorage(asset);

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

/**
 * Which generated-storage refusals mean what, in publishing's vocabulary.
 * The same mapping discipline the Drive path uses.
 */
const GENERATED_REFUSAL_CATEGORIES: Record<
  GeneratedMediaRefusal,
  ErrorCategory
> = {
  wrong_mime_type: "invalid_content",
  too_large: "invalid_content",
  empty_file: "missing_asset",
  not_owner: "missing_asset",
  no_worker_credential: "provider_not_connected",
  not_found: "missing_asset",
  storage_error: "media_source_unavailable",
};

/**
 * Stage 11 filled in the second adapter: files this application itself
 * generated into the private bucket. Ownership is proved by the object-key
 * prefix — the worker credential bypasses RLS, so the check is explicit here
 * exactly as it is for Drive.
 */
async function resolveFromGeneratedStorage(
  asset: MediaAsset,
): Promise<MediaSourceResult> {
  // createWorkerClient reads the validated server env, which throws in an
  // entirely unconfigured runtime; a media refusal must stay a refusal.
  let client: ReturnType<typeof createWorkerClient>["client"] = null;
  try {
    ({ client } = createWorkerClient());
  } catch {
    client = null;
  }
  if (client === null) {
    return {
      available: false,
      error: safeError(
        "provider_not_connected",
        GENERATED_MEDIA_REFUSAL_MESSAGES.no_worker_credential,
      ),
    };
  }

  const opened = await openGeneratedMedia(client, asset);
  if (!opened.ok) {
    return {
      available: false,
      error: safeError(
        GENERATED_REFUSAL_CATEGORIES[opened.refusal],
        opened.detail ?? GENERATED_MEDIA_REFUSAL_MESSAGES[opened.refusal],
      ),
    };
  }

  const media = opened.value;
  return {
    available: true,
    source: {
      contentType: media.contentType,
      contentLength: media.contentLength,
      filename: media.filename,
      open: async () => {
        const response = await media.open();
        if (response.body === null) {
          throw new Error("Generated storage returned no body for that file.");
        }
        return response.body as unknown as BodyInit;
      },
      openRange: async (start: number, end: number) => {
        const response = await media.openRange(start, end);
        if (response.body === null) {
          throw new Error("Generated storage returned no body for that range.");
        }
        return response.body as unknown as BodyInit;
      },
    },
  };
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
