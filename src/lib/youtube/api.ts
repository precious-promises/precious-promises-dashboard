import {
  THUMBNAIL_MIME_TYPES,
  YOUTUBE_API_BASE,
  YOUTUBE_LIMITS,
  YOUTUBE_UPLOAD_BASE,
} from "./config";
import { YouTubeApiError } from "./errors";
import {
  mapProcessingStatus,
  type ProcessingStatus,
  type VideoResource,
  type YouTubeChannel,
  type YouTubePlaylist,
} from "./types";

/**
 * The YouTube Data API v3 client.
 *
 * Written against `fetch` rather than `googleapis`, for three reasons that all
 * matter here: the official client is large and drags in a great deal this
 * application never calls; the resumable upload protocol is a handful of
 * headers that are clearer written out than configured; and every function
 * below takes its `fetch` as a parameter, which is what lets the whole client
 * be tested without a network, an account or a credential.
 *
 * **The access token never leaves this module in any direction but one.** It
 * goes into an `Authorization` header and nowhere else — not into a URL, not
 * into a thrown error, not into a log line.
 *
 * Every non-2xx response becomes a `YouTubeApiError`, which classifies itself
 * on construction. Callers deal in categories, not status codes.
 */

export interface YouTubeRequestContext {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Read a JSON body, or throw a classified error. */
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
    throw new YouTubeApiError(response.status, body);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Channel discovery
// ---------------------------------------------------------------------------

/**
 * The channel this authorisation belongs to.
 *
 * Returns `null` when the Google account has no YouTube channel — a real and
 * common state, not an error. A Google account is not a channel, and an
 * account without one cannot be connected as though it were.
 */
export async function fetchMyChannel(
  context: YouTubeRequestContext,
): Promise<YouTubeChannel | null> {
  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    items?: {
      id?: string;
      snippet?: { title?: string; customUrl?: string };
    }[];
  } | null;

  const item = body?.items?.[0];
  if (!item?.id) {
    return null;
  }

  return {
    id: item.id,
    // A channel with no title is quoted as having none rather than being given
    // an invented one.
    title: item.snippet?.title ?? "",
    customUrl: item.snippet?.customUrl ?? null,
  };
}

/** The playlists on the connected channel, so a real one can be chosen. */
export async function fetchMyPlaylists(
  context: YouTubeRequestContext,
): Promise<YouTubePlaylist[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlists`);
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "50");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    items?: {
      id?: string;
      snippet?: { title?: string };
      contentDetails?: { itemCount?: number };
    }[];
  } | null;

  return (body?.items ?? [])
    .filter(
      (item): item is { id: string } & typeof item =>
        typeof item.id === "string",
    )
    .map((item) => ({
      id: item.id,
      title: item.snippet?.title ?? "",
      itemCount: item.contentDetails?.itemCount ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Resumable upload
// ---------------------------------------------------------------------------

/**
 * Begin a resumable upload and return the session URI.
 *
 * Resumable rather than a single request because a video is large and a
 * connection dropped at 90% must not mean starting again — and, more
 * importantly here, because an interrupted single-shot upload leaves this
 * system unable to tell whether YouTube got the video. The session URI is what
 * makes that question answerable.
 *
 * **The returned URI is a bearer capability.** Anyone holding it can push
 * bytes into this upload without any other credential. It is encrypted before
 * storage, never rendered, and never written to a log or an audit record.
 *
 * `X-Upload-Content-Length` lets YouTube reject an over-size file before a
 * single byte of it is sent.
 */
export async function startResumableUpload(
  context: YouTubeRequestContext,
  resource: VideoResource,
  media: { contentLength: number; contentType: string },
  options: { notifySubscribers: boolean },
): Promise<string> {
  const url = new URL(`${YOUTUBE_UPLOAD_BASE}/videos`);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");
  url.searchParams.set(
    "notifySubscribers",
    options.notifySubscribers ? "true" : "false",
  );

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(media.contentLength),
      "X-Upload-Content-Type": media.contentType,
    },
    body: JSON.stringify(resource),
  });

  if (!response.ok) {
    await jsonOrThrow(response);
  }

  const sessionUri = response.headers.get("location");
  if (!sessionUri) {
    // A 2xx with no Location is not a session. Treating it as one would send
    // the video bytes nowhere and then report whatever came back.
    throw new YouTubeApiError(response.status, {
      error: {
        message: "YouTube accepted the upload request but returned no session.",
      },
    });
  }

  return sessionUri;
}

/**
 * Send the media bytes to an open session.
 *
 * Returns the video id YouTube assigned. That id is the only thing that proves
 * a publish happened, and it is the only thing `postedUpdate` will accept.
 */
export async function uploadMedia(
  sessionUri: string,
  body: BodyInit,
  media: { contentLength: number; contentType: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(media.contentLength),
    },
    body,
    // Node's fetch requires this for a streaming body; it is harmless for a
    // buffered one.
    duplex: "half",
  } as RequestInit);

  const parsed = (await jsonOrThrow(response)) as { id?: string } | null;

  if (!parsed?.id) {
    throw new YouTubeApiError(response.status, {
      error: {
        message: "YouTube accepted the upload but returned no video id.",
      },
    });
  }

  return parsed.id;
}

/** What a status query found out about an interrupted upload. */
export type UploadStatus =
  | { state: "incomplete"; bytesReceived: number }
  | { state: "complete"; videoId: string }
  | { state: "gone" };

/**
 * Ask an existing session what happened.
 *
 * This is the reconciliation step, and it is the reason the session URI is
 * stored at all. If a worker died after YouTube accepted the bytes but before
 * the success was written down, re-uploading would publish the video twice.
 * Asking cannot.
 *
 * A `308` means YouTube has some of the bytes and wants the rest. A `200` or
 * `201` means the video already exists — and its id comes back with it. A
 * `404` or `410` means the session has expired, and there is nothing to
 * resume.
 */
export async function queryUploadStatus(
  sessionUri: string,
  totalBytes: number,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadStatus> {
  const response = await fetchImpl(sessionUri, {
    method: "PUT",
    headers: {
      "Content-Length": "0",
      "Content-Range": `bytes */${totalBytes}`,
    },
  });

  if (response.status === 308) {
    // `Range: bytes=0-524287` means 524288 bytes are held. No Range header at
    // all means none are.
    const range = response.headers.get("range");
    const match = range?.match(/bytes=0-(\d+)/);
    return {
      state: "incomplete",
      bytesReceived: match ? Number(match[1]) + 1 : 0,
    };
  }

  if (response.status === 404 || response.status === 410) {
    return { state: "gone" };
  }

  const parsed = (await jsonOrThrow(response)) as { id?: string } | null;

  if (parsed?.id) {
    return { state: "complete", videoId: parsed.id };
  }

  return { state: "gone" };
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

/**
 * Set a custom thumbnail on an uploaded video.
 *
 * Deliberately separate from the upload and allowed to fail on its own. A
 * thumbnail rejection must not turn a genuinely published video into a failed
 * publish — the video is up, and saying otherwise would be as dishonest as
 * claiming a success that did not happen.
 *
 * Custom thumbnails also require a verified channel; an unverified one gets a
 * `forbidden` back, which is classified and reported rather than retried.
 */
export async function setThumbnail(
  context: YouTubeRequestContext,
  videoId: string,
  image: { bytes: Uint8Array; contentType: string },
): Promise<void> {
  if (image.bytes.byteLength > YOUTUBE_LIMITS.thumbnailBytes) {
    throw new YouTubeApiError(400, {
      error: {
        message: `The thumbnail is ${image.bytes.byteLength} bytes; YouTube allows ${YOUTUBE_LIMITS.thumbnailBytes}.`,
        errors: [{ reason: "invalidImage" }],
      },
    });
  }

  if (
    !(THUMBNAIL_MIME_TYPES as readonly string[]).includes(image.contentType)
  ) {
    throw new YouTubeApiError(400, {
      error: {
        message: `YouTube accepts ${THUMBNAIL_MIME_TYPES.join(" or ")} for thumbnails.`,
        errors: [{ reason: "invalidImage" }],
      },
    });
  }

  const url = new URL(`${YOUTUBE_UPLOAD_BASE}/thumbnails/set`);
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("uploadType", "media");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      "Content-Type": image.contentType,
    },
    body: image.bytes as unknown as BodyInit,
  });

  await jsonOrThrow(response);
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

/**
 * Add an uploaded video to a playlist.
 *
 * Like the thumbnail, this happens after the video exists and is allowed to
 * fail independently. It also needs the broader `youtube` scope: a connection
 * granted upload-only can publish but cannot file.
 */
export async function addToPlaylist(
  context: YouTubeRequestContext,
  playlistId: string,
  videoId: string,
): Promise<void> {
  const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
  url.searchParams.set("part", "snippet");

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "POST",
    headers: {
      ...authHeaders(context.accessToken),
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });

  await jsonOrThrow(response);
}

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

export interface ProcessingResult {
  status: ProcessingStatus;
  privacyStatus: string | null;
  /** What YouTube reports about a rejection, if it rejected the video. */
  rejectionReason: string | null;
}

/**
 * Ask YouTube what became of an uploaded video.
 *
 * A successful upload is not a published video: YouTube processes it
 * afterwards, and processing can fail — for a corrupt file, a copyright claim,
 * or a policy rejection. Recording only the upload would leave this system
 * asserting a video is live when YouTube took it down before anyone saw it.
 *
 * Also returns the *actual* privacy status, which is how an unaudited client
 * discovers that its `unlisted` request came back as `private`.
 */
export async function fetchProcessingStatus(
  context: YouTubeRequestContext,
  videoId: string,
): Promise<ProcessingResult | null> {
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set("part", "processingDetails,status");
  url.searchParams.set("id", videoId);

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: authHeaders(context.accessToken),
  });

  const body = (await jsonOrThrow(response)) as {
    items?: {
      processingDetails?: { processingStatus?: string };
      status?: { privacyStatus?: string; rejectionReason?: string };
    }[];
  } | null;

  const item = body?.items?.[0];
  if (!item) {
    return null;
  }

  return {
    status: mapProcessingStatus(
      item.processingDetails?.processingStatus ?? null,
    ),
    privacyStatus: item.status?.privacyStatus ?? null,
    rejectionReason: item.status?.rejectionReason ?? null,
  };
}
