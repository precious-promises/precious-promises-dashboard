/**
 * Media asset vocabulary.
 *
 * Stage 2 manages **metadata only**. Nothing here uploads, downloads, streams
 * or transcodes; a row is a record describing a file that lives somewhere else.
 */

export const MEDIA_TYPES = ["image", "video", "audio", "document"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Where the bytes actually live.
 *
 * `google_drive` is the approved primary library for large media, but **no
 * Drive integration exists** — selecting it records an intent and an external
 * id, and nothing in this application contacts Drive. See
 * docs/stage-2-content-library.md.
 */
export const STORAGE_PROVIDERS = [
  "google_drive",
  "supabase_storage",
  "external",
] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Whether the asset is cleared for use. */
export const RIGHTS_STATUSES = [
  "unknown",
  "owned",
  "licensed",
  "public_domain",
  "restricted",
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
};

export const STORAGE_PROVIDER_LABELS: Record<StorageProvider, string> = {
  google_drive: "Google Drive",
  supabase_storage: "Supabase Storage",
  external: "External",
};

export const RIGHTS_STATUS_LABELS: Record<RightsStatus, string> = {
  unknown: "Unknown",
  owned: "Owned",
  licensed: "Licensed",
  public_domain: "Public domain",
  restricted: "Restricted",
};

/** How a media asset is used by a content item. */
export const CONTENT_MEDIA_PURPOSES = [
  "primary",
  "thumbnail",
  "background",
  "audio_track",
  "supporting",
] as const;
export type ContentMediaPurpose = (typeof CONTENT_MEDIA_PURPOSES)[number];

export interface MediaAsset {
  id: string;
  owner_id: string;
  name: string;
  media_type: MediaType;
  storage_provider: StorageProvider;
  external_file_id: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  rights_status: RightsStatus;
  created_at: string;
  updated_at: string;
}
