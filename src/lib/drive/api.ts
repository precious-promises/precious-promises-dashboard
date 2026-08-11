import {
  DRIVE_API_BASE,
  FILE_FIELDS,
  FOLDER_MIME_TYPE,
  LIST_FIELDS,
  LIST_PAGE_SIZE,
} from "./config";
import { parseSize, type DriveFile, type DriveListing } from "./types";

/**
 * The Google Drive API v3 client.
 *
 * Written against `fetch` with the access token injected, so every function
 * here is testable with no network, no account and no credential — the same
 * shape as the YouTube client in `src/lib/youtube/api.ts`.
 *
 * **The access token goes into an `Authorization` header and nowhere else.**
 * Never into a URL, never into an error, never into a log line. A Drive
 * download URL carrying a token would be a capability that leaks through
 * browser history and referrer headers.
 *
 * Note what is absent: there is no function here that makes a file public,
 * creates a sharing link, or writes anything. The scope requested is
 * read-only, and this client could not write even if asked to.
 */

export interface DriveRequestContext {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export class DriveApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function jsonOrThrow(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;

  if (text.trim() !== "") {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    // Google's message can quote the request. Only the status and a mapped
    // sentence are carried forward.
    throw new DriveApiError(
      response.status,
      describeDriveStatus(response.status),
    );
  }

  return body;
}

export function describeDriveStatus(status: number): string {
  if (status === 401) {
    return "Google rejected the stored Drive authorisation.";
  }
  if (status === 403) {
    return "Google refused the Drive request. The permission may have been withdrawn, or a quota reached.";
  }
  if (status === 404) {
    return "Google Drive does not have a file with that id.";
  }
  if (status === 429) {
    return "Google rate limited the Drive request.";
  }
  if (status >= 500) {
    return "Google Drive is unavailable.";
  }
  return "Google refused the Drive request.";
}

/** Map one Drive file resource onto the fields this application uses. */
export function mapFile(raw: unknown): DriveFile | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const file = raw as Record<string, unknown>;
  if (typeof file.id !== "string" || typeof file.mimeType !== "string") {
    return null;
  }

  const video = file.videoMediaMetadata as
    { width?: number; height?: number; durationMillis?: string } | undefined;
  const image = file.imageMediaMetadata as
    { width?: number; height?: number } | undefined;

  const durationMillis = video?.durationMillis;

  return {
    id: file.id,
    name: typeof file.name === "string" ? file.name : "",
    mimeType: file.mimeType,
    sizeBytes: parseSize(file.size),
    parents: Array.isArray(file.parents)
      ? file.parents.filter((p): p is string => typeof p === "string")
      : [],
    trashed: file.trashed === true,
    modifiedTime:
      typeof file.modifiedTime === "string" ? file.modifiedTime : null,
    width: video?.width ?? image?.width ?? null,
    height: video?.height ?? image?.height ?? null,
    durationSeconds:
      typeof durationMillis === "string" && durationMillis !== ""
        ? Math.round(Number(durationMillis) / 1000) || null
        : null,
  };
}

/** One file's metadata. */
export async function getFile(
  context: DriveRequestContext,
  fileId: string,
): Promise<DriveFile | null> {
  const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", FILE_FIELDS);
  // Shared drives are opt-in per request; without this a file living on one
  // returns 404 rather than saying why.
  url.searchParams.set("supportsAllDrives", "true");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  if (response.status === 404) {
    return null;
  }

  return mapFile(await jsonOrThrow(response));
}

/**
 * The children of one folder.
 *
 * `q` is built from an escaped folder id, never from free text. A caller
 * cannot inject additional query clauses and widen the search.
 */
export async function listFolder(
  context: DriveRequestContext,
  folderId: string,
  pageToken?: string,
): Promise<DriveListing> {
  const url = new URL(`${DRIVE_API_BASE}/files`);

  url.searchParams.set(
    "q",
    `${quoteDriveId(folderId)} in parents and trashed = false`,
  );
  url.searchParams.set("fields", LIST_FIELDS);
  url.searchParams.set("pageSize", String(LIST_PAGE_SIZE));
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    files?: unknown[];
    nextPageToken?: string;
  } | null;

  return {
    files: (body?.files ?? [])
      .map(mapFile)
      .filter((file): file is DriveFile => file !== null),
    nextPageToken: body?.nextPageToken ?? null,
  };
}

/**
 * Quote a Drive id for use in a `q` expression.
 *
 * Drive ids are opaque and in practice URL-safe, but this is a query language
 * and a caller-supplied value: escaping the quote and backslash means an id
 * containing one cannot close the literal and append a clause of its own.
 */
export function quoteDriveId(id: string): string {
  return `'${id.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Open a file's bytes.
 *
 * Returns the `Response` so the caller can stream it. A large video must not
 * be buffered into memory in one piece — the body is handed to the upload as
 * a stream.
 *
 * `alt=media` is what makes Drive return contents rather than metadata, and it
 * only works for files genuinely stored in Drive: a Google Doc has no bytes to
 * download and must be exported instead. This application publishes uploaded
 * media, so that case is refused upstream by the MIME allow-list rather than
 * handled here.
 */
export async function openFileStream(
  context: DriveRequestContext,
  fileId: string,
  range?: { start: number; end?: number },
): Promise<Response> {
  const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const headers: Record<string, string> = authHeaders(context.accessToken);
  if (range) {
    headers.Range = `bytes=${range.start}-${range.end ?? ""}`;
  }

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new DriveApiError(
      response.status,
      describeDriveStatus(response.status),
    );
  }

  return response;
}

/** Whether a Drive id names a folder that exists and is reachable. */
export async function folderExists(
  context: DriveRequestContext,
  folderId: string,
): Promise<boolean> {
  const file = await getFile(context, folderId);
  return file !== null && file.mimeType === FOLDER_MIME_TYPE && !file.trashed;
}
