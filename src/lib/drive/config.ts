/**
 * Google Drive API v3 constants.
 *
 * Every value here was read from Google's current documentation at the time of
 * implementation. Provenance is recorded in docs/stage-8-media-instagram.md,
 * including which pages were reachable from this environment.
 *
 * ## The scope decision, and why it is not the narrowest one Google offers
 *
 * Google has **no scope that grants access to one folder**. The candidates:
 *
 * - `drive.metadata.readonly` — can list, but is explicitly **not authorised to
 *   download file contents**. Useless for publishing.
 * - `drive.file` — narrowest, but only covers files the app itself created or
 *   that the user hand-picked through the Google Picker. It cannot see a folder
 *   of footage that already exists, which is exactly what this product needs.
 * - `drive.readonly` — read metadata **and** content, across the whole Drive.
 *
 * So `drive.readonly` is the narrowest scope that can do the job. It is
 * broader than this application needs, and that gap is real: **the folder
 * boundary is enforced in application logic, not by Google.** Every path in
 * `./root.ts` verifies a file descends from `GOOGLE_DRIVE_ROOT_FOLDER_ID`
 * before its bytes are touched, and the Drive Browser cannot navigate outside
 * it — but a compromised server could read more than the root, and saying
 * otherwise would be a false assurance.
 */

/** Read metadata and content. The narrowest scope that can do both. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export const DRIVE_SCOPES = [DRIVE_SCOPE] as const;

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/**
 * The MIME type Drive gives a folder.
 *
 * Folders are files in Drive's model, distinguished only by this.
 */
export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * Fields requested for every file.
 *
 * Drive returns a sparse resource unless fields are named. Asking for exactly
 * what is used keeps responses small and makes it obvious in review what this
 * application knows about a file.
 */
export const FILE_FIELDS =
  "id,name,mimeType,size,parents,trashed,modifiedTime,videoMediaMetadata,imageMediaMetadata";

export const LIST_FIELDS = `nextPageToken,files(${FILE_FIELDS})`;

/** How many entries one folder listing returns. */
export const LIST_PAGE_SIZE = 100;

/**
 * How far up the parent chain a containment check will walk.
 *
 * Drive folders form a graph, not strictly a tree — a file can have several
 * parents. A bounded walk means a deep or cyclic structure cannot hang the
 * request; exceeding the bound is reported as "not provably inside the root",
 * which refuses rather than allows.
 */
export const MAX_PARENT_WALK_DEPTH = 12;

/**
 * MIME types this product will publish.
 *
 * Deliberately a small allow-list rather than a `video/*` wildcard. An
 * unexpected type reaching an upload is a failure at the platform, after the
 * bytes have been sent.
 */
export const PUBLISHABLE_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
] as const;

export const PUBLISHABLE_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export const PUBLISHABLE_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
] as const;

/**
 * The folder layout Precious Promises media is organised into.
 *
 * Shown in the Drive Browser as guidance. **Not enforced** — the boundary that
 * matters is the root, and requiring exact subfolder names would break the
 * moment Dave renamed one.
 */
export const EXPECTED_FOLDERS = [
  "01 Background Videos",
  "02 Background Images",
  "03 Thumbnails",
  "04 Music and Ambience",
  "05 ElevenLabs Voiceovers",
  "06 Scripts",
  "07 Shorts Ready",
  "08 Long Videos Ready",
  "09 Sleep Videos Ready",
  "10 Published",
  "11 Project Files",
] as const;

export const DRIVE_ROOT_NAME = "Precious Promises Content";

/** Which of our media types a Drive MIME type maps to, or null if unusable. */
export function mediaTypeForMime(
  mimeType: string,
): "video" | "image" | "audio" | null {
  if ((PUBLISHABLE_VIDEO_TYPES as readonly string[]).includes(mimeType)) {
    return "video";
  }
  if ((PUBLISHABLE_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
    return "image";
  }
  if ((PUBLISHABLE_AUDIO_TYPES as readonly string[]).includes(mimeType)) {
    return "audio";
  }
  return null;
}

export function isFolder(mimeType: string): boolean {
  return mimeType === FOLDER_MIME_TYPE;
}

/**
 * A filename safe to send to a third party.
 *
 * Drive names are user-supplied and can contain newlines, quotes and path
 * separators. Any of those in an HTTP header is a header-injection primitive,
 * and this name is destined for one.
 */
export function safeFilename(name: string): string {
  const cleaned = name
    .replace(/[\r\n\t]/g, " ")
    .replace(/[/\\]/g, "-")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 200) || "untitled";
}
