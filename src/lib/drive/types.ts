/**
 * Google Drive domain types.
 *
 * Only the fields this application actually uses appear, so an unused field
 * cannot be quietly relied on later — and so it is obvious in review exactly
 * what is known about a file.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  /** Drive returns this as a string; it is parsed once, here. */
  sizeBytes: number | null;
  parents: string[];
  trashed: boolean;
  modifiedTime: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export interface DriveListing {
  files: DriveFile[];
  nextPageToken: string | null;
}

/**
 * Why a Drive file cannot be used.
 *
 * Each is a different problem with a different fix, so they are distinct
 * rather than one blanket refusal.
 */
export const DRIVE_REFUSALS = [
  "not_connected",
  "not_configured",
  "outside_root",
  "not_found",
  "trashed",
  "is_folder",
  "unsupported_type",
  "no_size",
  "unreadable",
] as const;

export type DriveRefusal = (typeof DRIVE_REFUSALS)[number];

export const DRIVE_REFUSAL_MESSAGES: Record<DriveRefusal, string> = {
  not_connected: "No Google Drive account is connected.",
  not_configured:
    "GOOGLE_DRIVE_ROOT_FOLDER_ID is not set, so no folder is approved for use.",
  outside_root:
    "That file is not inside the approved Precious Promises Content folder.",
  not_found: "Google Drive does not have a file with that id.",
  trashed: "That file is in the Drive bin.",
  is_folder: "That is a folder, not a file.",
  unsupported_type: "That file type cannot be published.",
  no_size:
    "Google Drive reported no size for that file, so it cannot be uploaded.",
  unreadable: "That file could not be read from Google Drive.",
};

export type DriveResult<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: DriveRefusal; detail?: string };

export function refuse<T>(
  refusal: DriveRefusal,
  detail?: string,
): DriveResult<T> {
  return { ok: false, refusal, detail };
}

/** The message shown for a refusal, with any extra detail appended. */
export function refusalMessage(refusal: DriveRefusal, detail?: string): string {
  const base = DRIVE_REFUSAL_MESSAGES[refusal];
  return detail ? `${base} ${detail}` : base;
}

/** Parse Drive's string `size` without turning a missing value into zero. */
export function parseSize(size: unknown): number | null {
  if (typeof size === "number" && Number.isFinite(size)) {
    return size;
  }
  if (typeof size !== "string" || size.trim() === "") {
    return null;
  }
  const parsed = Number(size);
  return Number.isFinite(parsed) ? parsed : null;
}
