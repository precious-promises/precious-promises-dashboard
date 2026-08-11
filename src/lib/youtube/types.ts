import type { PrivacyStatus } from "./config";

/**
 * YouTube domain types.
 *
 * These describe what this application stores and what it sends. They are not
 * a mirror of the API's full resource shapes — only the fields actually used
 * appear, so an unused field cannot be quietly relied on later.
 */

/** The stored, owner-editable YouTube settings for one platform variant. */
export interface YouTubeVideoMetadata {
  id: string;
  owner_id: string;
  platform_variant_id: string;
  category_id: string | null;
  default_language: string | null;
  default_audio_language: string | null;
  tags: string[];
  privacy_status: PrivacyStatus;
  /**
   * `null` means the owner has not answered.
   *
   * This is a legal declaration under COPPA, not a preference, so it has no
   * default that could be mistaken for an answer — and an upload is refused
   * until it is answered.
   */
  self_declared_made_for_kids: boolean | null;
  contains_synthetic_media: boolean;
  notify_subscribers: boolean;
  playlist_id: string | null;
  thumbnail_media_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A channel as returned by `channels.list(mine=true)`. */
export interface YouTubeChannel {
  id: string;
  title: string;
  customUrl: string | null;
}

/** A playlist owned by the connected channel. */
export interface YouTubePlaylist {
  id: string;
  title: string;
  itemCount: number | null;
}

/**
 * The request body for `videos.insert`.
 *
 * Built by `buildVideoResource` and sent verbatim. Keeping it as a typed value
 * rather than an inline object literal means the shape can be asserted in a
 * test without a network call.
 */
export interface VideoResource {
  snippet: {
    title: string;
    description: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  status: {
    privacyStatus: PrivacyStatus;
    selfDeclaredMadeForKids: boolean;
    containsSyntheticMedia: boolean;
    /** Always `false` here: this client cannot publish anything itself. */
    embeddable?: boolean;
  };
}

/**
 * The state of a resumable upload, as this system records it.
 *
 * `sessionUri` is deliberately absent. It is a bearer capability — anyone
 * holding it can push bytes into the upload — so it is never carried on a type
 * that anything might render or log. It is decrypted at the point of use and
 * nowhere else.
 */
export interface UploadSessionRecord {
  id: string;
  owner_id: string;
  scheduled_post_id: string;
  idempotency_key: string;
  bytes_total: number | null;
  bytes_sent: number;
  video_id: string | null;
  status: "open" | "completed" | "abandoned";
  created_at: string;
  updated_at: string;
}

/**
 * YouTube's own processing state after a successful upload.
 *
 * **Uploaded is not published.** The bytes arriving and the video being
 * watchable are different events, sometimes minutes apart and sometimes never
 * — processing can fail. Conflating them would report a success the audience
 * never saw.
 */
export const PROCESSING_STATUSES = [
  "uploaded",
  "processing",
  "processed",
  "processing_failed",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  uploaded: "Uploaded, not yet processed",
  processing: "YouTube is processing it",
  processed: "Processed by YouTube",
  processing_failed: "YouTube could not process it",
};

/**
 * Map `processingDetails.processingStatus` onto our vocabulary.
 *
 * The API's `succeeded`/`failed`/`processing`/`terminated` values are mapped
 * rather than stored raw, so an unfamiliar value becomes `uploaded` — "we know
 * it arrived, we do not know more" — instead of an invented conclusion.
 */
export function mapProcessingStatus(
  apiStatus: string | null,
): ProcessingStatus {
  switch (apiStatus) {
    case "succeeded":
      return "processed";
    case "processing":
      return "processing";
    case "failed":
    case "terminated":
      return "processing_failed";
    default:
      return "uploaded";
  }
}

/** The canonical watch URL for a video id. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
