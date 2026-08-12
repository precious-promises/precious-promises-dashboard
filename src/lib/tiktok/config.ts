/**
 * TikTok Login Kit and Content Posting API constants.
 *
 * Read from TikTok's current developer documentation at the time of
 * implementation; provenance is recorded in docs/stage-9-tiktok.md.
 *
 * ## The restriction that shapes everything
 *
 * **An API client that has not passed TikTok's audit can only post
 * `SELF_ONLY`** — visible to the creator alone. TikTok enforces this two ways:
 * it refuses a `privacy_level` that is not one it returned for that creator,
 * and for an unaudited client it does not return the public options at all.
 *
 * So this application never offers a privacy level it has not been told is
 * available, and never presents a "post publicly" control that could not work.
 * The available options are read from TikTok per creator, at the moment they
 * are needed.
 */

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** Where the owner is sent to grant access. */
export const TIKTOK_AUTH_ENDPOINT = "https://www.tiktok.com/v2/auth/authorize/";

export const TIKTOK_TOKEN_ENDPOINT =
  "https://open.tiktokapis.com/v2/oauth/token/";

export const TIKTOK_REVOKE_ENDPOINT =
  "https://open.tiktokapis.com/v2/oauth/revoke/";

export const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

/**
 * The scopes this application requests.
 *
 * - `user.info.basic` identifies the account after authorisation. Without it a
 *   connection could not say whose it is.
 * - `video.upload` sends a video to the creator's TikTok **drafts**, where
 *   they finish and post it by hand.
 * - `video.publish` is what allows a **direct post**, and is the one that
 *   needs TikTok's audit.
 *
 * Nothing about comments, messages or analytics is requested.
 */
export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.upload",
  "video.publish",
] as const;

export type TikTokScope = (typeof TIKTOK_SCOPES)[number];

export const UPLOAD_SCOPE: TikTokScope = "video.upload";
export const PUBLISH_SCOPE: TikTokScope = "video.publish";

/**
 * Token lifetimes, as documented.
 *
 * An access token lasts a day and a refresh token a year — but the refresh
 * token expires after 365 days **of inactivity**, and a user revoking the app
 * in their TikTok settings ends it immediately. Either way the recovery is a
 * reconnection, not a retry.
 */
export const ACCESS_TOKEN_SECONDS = 86_400;
export const REFRESH_TOKEN_SECONDS = 31_536_000;

// ---------------------------------------------------------------------------
// Content Posting API
// ---------------------------------------------------------------------------

/** Who this authorisation belongs to. Read before a connection is recorded. */
export const USER_INFO_ENDPOINT = `${TIKTOK_API_BASE}/user/info/`;

/** The identity fields `user.info.basic` grants. Nothing beyond them is asked. */
export const USER_INFO_FIELDS = "open_id,union_id,avatar_url,display_name";

/** Which settings a given creator is allowed to use. Queried, never assumed. */
export const CREATOR_INFO_ENDPOINT = `${TIKTOK_API_BASE}/post/publish/creator_info/query/`;

/** Initialise a direct post — a real, visible TikTok post. */
export const DIRECT_POST_INIT_ENDPOINT = `${TIKTOK_API_BASE}/post/publish/video/init/`;

/** Initialise an upload to the creator's drafts. Not a post. */
export const INBOX_INIT_ENDPOINT = `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`;

/** Poll the lifecycle of an initialised publish. */
export const PUBLISH_STATUS_ENDPOINT = `${TIKTOK_API_BASE}/post/publish/status/fetch/`;

// ---------------------------------------------------------------------------
// Media transfer
// ---------------------------------------------------------------------------

/**
 * How media reaches TikTok.
 *
 * TikTok supports two sources. This application uses **`FILE_UPLOAD`** only.
 *
 * `PULL_FROM_URL` would have TikTok fetch the video from a URL its servers can
 * reach, which requires proving ownership of the domain **and** exposing the
 * media publicly. That is the same trade refused for Instagram images in
 * Stage 8, and it is refused here for the same reason: a video Dave has not
 * published yet would be readable by anyone who guessed the URL.
 *
 * `FILE_UPLOAD` streams the bytes from Google Drive through this server to
 * TikTok, authenticated at both ends, exposing nothing.
 */
export const MEDIA_SOURCE = "FILE_UPLOAD" as const;

export const PULL_FROM_URL_SUPPORTED = false;

export const PULL_FROM_URL_REFUSAL =
  "PULL_FROM_URL would require verifying domain ownership with TikTok and exposing the video at a publicly reachable URL before it was published. The bytes are streamed directly instead.";

/**
 * Chunking rules, as documented.
 *
 * A chunk must be at least 5 MB and at most 64 MB, except the final chunk,
 * which may run to 128 MB to carry the trailing bytes. A video under 5 MB is
 * sent whole. No more than 1,000 chunks.
 */
export const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 64 * 1024 * 1024;
export const MAX_FINAL_CHUNK_BYTES = 128 * 1024 * 1024;
export const MAX_CHUNK_COUNT = 1000;

/** The chunk size this client uses when a video is large enough to split. */
export const PREFERRED_CHUNK_BYTES = 10 * 1024 * 1024;

/**
 * Work out how a video will be split.
 *
 * `total_chunk_count` is documented as the video size divided by the chunk
 * size **rounded down**, which means the last chunk carries the remainder and
 * can legitimately exceed `chunk_size`. Rounding up instead would produce a
 * final chunk TikTok rejects as too small.
 *
 * Returns `null` when the video cannot be sent within the documented limits,
 * rather than producing a plan that would fail mid-upload.
 */
export function planChunks(
  videoSizeBytes: number,
): { chunkSize: number; totalChunks: number } | null {
  if (!Number.isFinite(videoSizeBytes) || videoSizeBytes <= 0) {
    return null;
  }

  // Small enough to go in one piece — and it must, because a lone chunk below
  // the 5 MB floor is only allowed when it is the whole video.
  if (videoSizeBytes < MIN_CHUNK_BYTES) {
    return { chunkSize: videoSizeBytes, totalChunks: 1 };
  }

  let chunkSize = PREFERRED_CHUNK_BYTES;
  let totalChunks = Math.floor(videoSizeBytes / chunkSize);

  // Keep the count inside the documented ceiling by growing the chunk.
  while (totalChunks > MAX_CHUNK_COUNT && chunkSize < MAX_CHUNK_BYTES) {
    chunkSize = Math.min(chunkSize * 2, MAX_CHUNK_BYTES);
    totalChunks = Math.floor(videoSizeBytes / chunkSize);
  }

  if (totalChunks > MAX_CHUNK_COUNT || totalChunks < 1) {
    return null;
  }

  // The final chunk carries the remainder. If that would exceed the documented
  // maximum, this video cannot be sent under these rules.
  const finalChunkBytes = videoSizeBytes - (totalChunks - 1) * chunkSize;
  if (finalChunkBytes > MAX_FINAL_CHUNK_BYTES) {
    return null;
  }

  return { chunkSize, totalChunks };
}

/** The byte range one chunk covers, inclusive, as `Content-Range` wants it. */
export function chunkRange(
  index: number,
  chunkSize: number,
  totalChunks: number,
  videoSizeBytes: number,
): { start: number; end: number } {
  const start = index * chunkSize;
  const end =
    index === totalChunks - 1 ? videoSizeBytes - 1 : start + chunkSize - 1;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Publication settings
// ---------------------------------------------------------------------------

export const PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LEVEL_LABELS: Record<PrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends (mutual follows)",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me (private)",
};

/**
 * The delivery modes this integration can offer.
 *
 * Which of them is actually available depends on the granted scopes and on
 * whether TikTok has audited the client — so availability is computed at
 * runtime, never assumed.
 */
export const DELIVERY_MODES = ["direct_post", "inbox", "manual"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  direct_post: "Post directly to TikTok",
  inbox: "Send to TikTok drafts",
  manual: "Prepare for manual posting",
};

export const DELIVERY_MODE_DETAIL: Record<DeliveryMode, string> = {
  direct_post:
    "Creates a real TikTok post. Needs the publish permission, and an unaudited client can only post privately.",
  inbox:
    "Uploads to your TikTok drafts, where you finish and post it yourself. This is not a post.",
  manual:
    "Prepares the caption, settings and media so you can post by hand. Nothing is sent to TikTok.",
};

/**
 * Caption limit.
 *
 * TikTok has raised this over time and it varies by surface, so the value here
 * is used as a **warning threshold** rather than a hard refusal — rejecting a
 * caption TikTok would have accepted is worse than letting TikTok decide.
 */
export const CAPTION_WARNING_CHARACTERS = 2200;

/**
 * How long to wait for TikTok to finish processing.
 *
 * Bounded so a worker cannot wait forever on a publish that will never
 * complete.
 */
export const STATUS_POLL_INTERVAL_MS = 5_000;
export const STATUS_POLL_MAX_ATTEMPTS = 30;
