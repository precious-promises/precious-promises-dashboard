/**
 * Instagram Platform constants.
 *
 * Read from Meta's current documentation at the time of implementation;
 * provenance is recorded in docs/stage-8-media-instagram.md.
 *
 * ## Which Instagram API this is
 *
 * **Instagram API with Instagram Login** — the "Business Login for Instagram"
 * path, which authenticates an Instagram professional account directly.
 *
 * Deliberately **not** the Instagram Basic Display API, which is deprecated and
 * could never publish anyway. And not the Facebook-Login path, which requires
 * the Instagram account to be linked to a Facebook Page — a constraint this
 * product should not impose on Dave when a direct path exists.
 *
 * ## The token model is not Google's
 *
 * Google issues a refresh token that lives until revoked. Meta does not. It
 * issues a **short-lived token (about an hour)**, which is exchanged for a
 * **long-lived token valid for 60 days**, which is then refreshed by
 * presenting itself before it expires.
 *
 * Two consequences this codebase has to respect:
 *
 * 1. There is no refresh token to store. The long-lived token *is* the
 *    credential, so it is stored encrypted as the access token with its real
 *    expiry, and `encrypted_refresh_token` stays null for Instagram.
 * 2. **A connection left unused for 60 days dies.** Nothing here can prevent
 *    that; the interface says so rather than letting it be discovered as a
 *    failed publish.
 */

export const INSTAGRAM_AUTH_ENDPOINT =
  "https://api.instagram.com/oauth/authorize";

/** Exchanges the authorisation code for a short-lived token. */
export const INSTAGRAM_TOKEN_ENDPOINT =
  "https://api.instagram.com/oauth/access_token";

export const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

/** Where a Reel's bytes are uploaded. A different host from the Graph API. */
export const INSTAGRAM_UPLOAD_BASE =
  "https://rupload.facebook.com/ig-api-upload";

/**
 * The Graph API version this code was written against.
 *
 * Pinned rather than floating: Meta deprecates versions on a published
 * timetable, and an unpinned call changes behaviour underneath you without a
 * deploy.
 */
export const INSTAGRAM_API_VERSION = "v23.0";

/**
 * The permissions requested.
 *
 * `instagram_business_basic` identifies the account. `instagram_business_content_publish`
 * is what allows publishing, and it requires **App Review** — an app that has
 * not passed review can only act for users with a role on the app itself.
 *
 * Messaging, comment-management and insights permissions are deliberately not
 * requested. This product publishes; it does not read Dave's inbox.
 */
export const INSTAGRAM_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export const PUBLISH_SCOPE = "instagram_business_content_publish";

/** How long Meta's long-lived token lasts, for display. */
export const LONG_LIVED_TOKEN_DAYS = 60;

// ---------------------------------------------------------------------------
// What can and cannot be published, and why
// ---------------------------------------------------------------------------

export const INSTAGRAM_MEDIA_TYPES = ["reels", "image", "carousel"] as const;
export type InstagramMediaType = (typeof INSTAGRAM_MEDIA_TYPES)[number];

export const INSTAGRAM_MEDIA_TYPE_LABELS: Record<InstagramMediaType, string> = {
  reels: "Reel",
  image: "Single image",
  carousel: "Carousel",
};

/**
 * **The decisive finding of Stage 8's Instagram research.**
 *
 * Meta's container-based publishing normally fetches media from a URL that
 * *Meta's servers* must be able to reach — `image_url` for photos, `video_url`
 * for video. That would mean exposing Dave's Drive files publicly, or building
 * an endpoint that serves them to the open internet.
 *
 * **Reels have a second path.** Creating a container with
 * `upload_type=resumable` returns a container id whose bytes are then POSTed
 * directly to `rupload.facebook.com` with `offset` and `file_size` headers.
 * No public URL, no exposure, no delivery endpoint.
 *
 * **Images and carousels have no such path.** They are documented only with
 * publicly accessible URLs.
 *
 * So this integration publishes Reels and refuses the rest. The alternative —
 * a signed public media endpoint — would mean this application served Dave's
 * media to anyone holding a URL, and would be a genuinely new attack surface
 * built to work around a platform limitation. That is not a trade worth making
 * for a format this product barely uses: Precious Promises is video-first.
 */
export const MEDIA_DELIVERY: Record<
  InstagramMediaType,
  { supported: boolean; detail: string }
> = {
  reels: {
    supported: true,
    detail:
      "Uploaded as bytes directly to Meta's resumable upload endpoint. Nothing is exposed publicly.",
  },
  image: {
    supported: false,
    detail:
      "Meta fetches a photo from a publicly reachable URL, and offers no binary upload for it. Publishing one would mean exposing the file to the open internet, which this application will not do.",
  },
  carousel: {
    supported: false,
    detail:
      "Each carousel item is fetched from a publicly reachable URL, with no binary upload. Same refusal as a single image, multiplied.",
  },
};

export function canPublishMediaType(mediaType: InstagramMediaType): boolean {
  return MEDIA_DELIVERY[mediaType].supported;
}

/**
 * Stories are not implemented.
 *
 * They use the same URL-fetch delivery as images, so they carry the same
 * refusal — and they expire after 24 hours, which sits awkwardly with an
 * approval-and-schedule workflow built around durable posts.
 */
export const STORIES_SUPPORTED = false;

/**
 * The first comment is **not** automated.
 *
 * Posting one after publishing needs a comment-management permission this app
 * does not request, and it is a second write that can fail independently of
 * the post. Stage 3 already stores `first_comment` on the variant; it stays
 * there as text to copy, which is honest about what happens.
 */
export const FIRST_COMMENT_AUTOMATED = false;

/**
 * Documented caption limit.
 *
 * Meta documents 2,200 characters, with limits on hashtags and @ mentions
 * within it. The hashtag and mention counts are enforced too, because
 * exceeding them fails the container rather than the publish — after the bytes
 * have gone.
 */
export const INSTAGRAM_LIMITS = {
  captionCharacters: 2200,
  hashtags: 30,
  mentions: 20,
} as const;

/** How long Meta keeps an unpublished container before discarding it. */
export const CONTAINER_EXPIRY_HOURS = 24;

/**
 * How long to wait for a container to finish processing.
 *
 * Meta's guidance is to poll rather than publish immediately; a container that
 * is not `FINISHED` cannot be published. These bounds keep a worker from
 * waiting forever on a container that will never finish.
 */
export const CONTAINER_POLL_INTERVAL_MS = 5_000;
export const CONTAINER_POLL_MAX_ATTEMPTS = 30;
