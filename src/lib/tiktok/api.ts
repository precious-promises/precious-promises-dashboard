import {
  CREATOR_INFO_ENDPOINT,
  DIRECT_POST_INIT_ENDPOINT,
  INBOX_INIT_ENDPOINT,
  MEDIA_SOURCE,
  PRIVACY_LEVELS,
  PUBLISH_STATUS_ENDPOINT,
  USER_INFO_ENDPOINT,
  USER_INFO_FIELDS,
  type PrivacyLevel,
} from "./config";
import { TikTokApiError, isOk } from "./errors";
import type { CreatorInfo } from "./types";

/**
 * The TikTok Content Posting API client.
 *
 * `fetch` is injected throughout, so every call is testable without a network,
 * an account or a credential.
 *
 * Two things about TikTok's responses shape this whole module:
 *
 * 1. **HTTP 200 is not success.** Every response carries `error.code`, and a
 *    successful one says `ok`. A client that trusted the status would treat a
 *    rejected post as a published one.
 * 2. **The upload URL is a bearer capability.** It comes back from `init` and
 *    anyone holding it can push bytes into that upload. It is passed straight
 *    to the uploader and never returned to anything that renders or logs.
 */

export interface TikTokRequestContext {
  accessToken: string;
  fetchImpl?: typeof fetch;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
  };
}

/**
 * Read a response, raising on anything that is not an explicit `ok`.
 *
 * The status is checked too, but only as a fallback: TikTok's own code is the
 * authoritative signal and an unparseable body is a failure either way.
 */
async function readOrThrow(
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: unknown = null;

  if (text.trim() !== "") {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok || !isOk(body)) {
    throw new TikTokApiError(response.status, body);
  }

  return (body ?? {}) as Record<string, unknown>;
}

function dataOf(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data;
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

export interface TikTokUser {
  openId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Who this authorisation belongs to.
 *
 * Called before a connection is recorded. A token proves somebody authorised
 * something; this proves **which account** — and a connection recorded from a
 * manually supplied id, or from the token alone, would present as working and
 * fail every publish against an account nobody chose.
 *
 * `open_id` is TikTok's stable identifier for this user under this application,
 * and it is what the account row is keyed on.
 */
export async function fetchUser(
  context: TikTokRequestContext,
): Promise<TikTokUser | null> {
  const url = new URL(USER_INFO_ENDPOINT);
  url.searchParams.set("fields", USER_INFO_FIELDS);

  const response = await (context.fetchImpl ?? fetch)(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${context.accessToken}` },
  });

  const data = dataOf(await readOrThrow(response));
  const user =
    typeof data.user === "object" && data.user !== null
      ? (data.user as Record<string, unknown>)
      : {};

  if (typeof user.open_id !== "string" || user.open_id === "") {
    return null;
  }

  return {
    openId: user.open_id,
    displayName:
      typeof user.display_name === "string" && user.display_name !== ""
        ? user.display_name
        : null,
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : null,
  };
}

// ---------------------------------------------------------------------------
// Creator capability
// ---------------------------------------------------------------------------

/**
 * Ask TikTok what this creator is allowed to do.
 *
 * Called before any post is prepared, and its answer is the **only** source of
 * the privacy levels this application will offer. TikTok refuses a
 * `privacy_level` it did not return for that creator, and for a client it has
 * not audited it does not return the public ones at all.
 *
 * So the options are read, never assumed, never cached past the moment they are
 * needed, and never widened by this application.
 */
export async function fetchCreatorInfo(
  context: TikTokRequestContext,
): Promise<CreatorInfo> {
  const response = await (context.fetchImpl ?? fetch)(CREATOR_INFO_ENDPOINT, {
    method: "POST",
    headers: authHeaders(context.accessToken),
  });

  const data = dataOf(await readOrThrow(response));

  const options = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options
    : [];

  return {
    username:
      typeof data.creator_username === "string" ? data.creator_username : "",
    nickname:
      typeof data.creator_nickname === "string" ? data.creator_nickname : null,
    avatarUrl:
      typeof data.creator_avatar_url === "string"
        ? data.creator_avatar_url
        : null,
    // Anything TikTok returns that this application does not recognise is
    // dropped rather than passed through, so an unknown value can never end up
    // in a post request.
    privacyLevelOptions: options.filter((option): option is PrivacyLevel =>
      (PRIVACY_LEVELS as readonly string[]).includes(option as string),
    ),
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoPostDurationSec:
      typeof data.max_video_post_duration_sec === "number"
        ? data.max_video_post_duration_sec
        : null,
  };
}

// ---------------------------------------------------------------------------
// Initialising an upload
// ---------------------------------------------------------------------------

export interface SourceInfo {
  videoSizeBytes: number;
  chunkSizeBytes: number;
  totalChunkCount: number;
}

export interface DirectPostInfo {
  title: string;
  privacyLevel: PrivacyLevel;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  /** Paid partnership with a third-party brand. */
  brandContentToggle: boolean;
  /** Promoting the creator's own brand. */
  brandOrganicToggle: boolean;
}

/**
 * What `init` returns.
 *
 * `uploadUrl` is the bearer capability. It exists on this type because the
 * uploader needs it in the same call stack — it is never persisted in plaintext
 * and never crosses into anything the browser can see.
 */
export interface InitResult {
  publishId: string;
  uploadUrl: string;
}

function sourceInfoBody(source: SourceInfo): Record<string, unknown> {
  return {
    source: MEDIA_SOURCE,
    video_size: source.videoSizeBytes,
    chunk_size: source.chunkSizeBytes,
    total_chunk_count: source.totalChunkCount,
  };
}

async function initialise(
  context: TikTokRequestContext,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<InitResult> {
  const response = await (context.fetchImpl ?? fetch)(endpoint, {
    method: "POST",
    headers: authHeaders(context.accessToken),
    body: JSON.stringify(body),
  });

  const data = dataOf(await readOrThrow(response));

  const publishId = data.publish_id;
  const uploadUrl = data.upload_url;

  if (typeof publishId !== "string" || publishId === "") {
    throw new TikTokApiError(response.status, {
      error: {
        code: "invalid_response",
        message: "TikTok accepted the request but returned no publish id.",
      },
    });
  }

  if (typeof uploadUrl !== "string" || uploadUrl === "") {
    throw new TikTokApiError(response.status, {
      error: {
        code: "invalid_response",
        message:
          "TikTok returned no upload URL, so there is nowhere to send the video.",
      },
    });
  }

  return { publishId, uploadUrl };
}

/**
 * Initialise a **direct post** — a real, visible TikTok post.
 *
 * `privacy_level` is required here and has no default anywhere in this system:
 * it is whichever value the owner chose from the list TikTok returned for their
 * own account. Choosing one on their behalf would be this application picking
 * an audience for Dave's content.
 */
export async function initDirectPost(
  context: TikTokRequestContext,
  post: DirectPostInfo,
  source: SourceInfo,
): Promise<InitResult> {
  return initialise(context, DIRECT_POST_INIT_ENDPOINT, {
    post_info: {
      title: post.title,
      privacy_level: post.privacyLevel,
      disable_comment: post.disableComment,
      disable_duet: post.disableDuet,
      disable_stitch: post.disableStitch,
      brand_content_toggle: post.brandContentToggle,
      brand_organic_toggle: post.brandOrganicToggle,
    },
    source_info: sourceInfoBody(source),
  });
}

/**
 * Initialise an upload to the creator's **drafts**.
 *
 * There is no `post_info` because there is no post: TikTok holds the video in
 * the creator's inbox and they finish and publish it themselves, in the app.
 * That is why this path needs no privacy level and no audit — and why a
 * completed inbox upload must never be recorded as a publication.
 */
export async function initInboxUpload(
  context: TikTokRequestContext,
  source: SourceInfo,
): Promise<InitResult> {
  return initialise(context, INBOX_INIT_ENDPOINT, {
    source_info: sourceInfoBody(source),
  });
}

// ---------------------------------------------------------------------------
// Sending the bytes
// ---------------------------------------------------------------------------

/**
 * Send one chunk to TikTok's upload URL.
 *
 * `Content-Range` is inclusive at both ends and states the total size, which is
 * how TikTok reassembles chunks that may arrive in any order. The upload URL is
 * already an authenticated capability, so no bearer token is sent with it —
 * adding one would put the account credential on a host that does not need it.
 *
 * TikTok answers an accepted chunk with 2xx and an empty body, so there is no
 * `error.code` to read: the status is the only signal this one call has.
 */
export async function uploadChunk(
  input: {
    uploadUrl: string;
    body: BodyInit;
    contentType: string;
    start: number;
    end: number;
    totalBytes: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(input.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": input.contentType,
      "Content-Length": String(input.end - input.start + 1),
      "Content-Range": `bytes ${input.start}-${input.end}/${input.totalBytes}`,
    },
    body: input.body,
    duplex: "half",
  } as RequestInit);

  if (!response.ok) {
    throw new TikTokApiError(response.status, {
      error: {
        code: "upload_failed",
        message: `TikTok refused bytes ${input.start}-${input.end}.`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface PublishStatusResult {
  /** TikTok's own status string, unmapped. */
  status: string | null;
  /** Present only once a direct post is genuinely live. */
  postIds: string[];
  failReason: string | null;
  uploadedBytes: number | null;
}

/**
 * Ask TikTok what became of a publish.
 *
 * This is the only call that can turn an accepted upload into a recorded post.
 * `publicaly_available_post_id` — TikTok's spelling, not a typo here — is the
 * proof: without an id in it there is no post to point at, whatever the status
 * says.
 */
export async function fetchPublishStatus(
  context: TikTokRequestContext,
  publishId: string,
): Promise<PublishStatusResult> {
  const response = await (context.fetchImpl ?? fetch)(PUBLISH_STATUS_ENDPOINT, {
    method: "POST",
    headers: authHeaders(context.accessToken),
    body: JSON.stringify({ publish_id: publishId }),
  });

  const data = dataOf(await readOrThrow(response));

  const rawIds = data.publicaly_available_post_id;
  const postIds = Array.isArray(rawIds)
    ? rawIds
        .filter((id): id is string | number => {
          return typeof id === "string" || typeof id === "number";
        })
        .map((id) => String(id))
        .filter((id) => id !== "")
    : [];

  return {
    status: typeof data.status === "string" ? data.status : null,
    postIds,
    failReason:
      typeof data.fail_reason === "string" && data.fail_reason !== ""
        ? data.fail_reason
        : null,
    uploadedBytes:
      typeof data.uploaded_bytes === "number" ? data.uploaded_bytes : null,
  };
}
