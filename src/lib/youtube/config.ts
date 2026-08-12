/**
 * YouTube Data API v3 and Google OAuth 2.0 constants.
 *
 * Every value here was read from Google's current documentation at the time of
 * implementation, and each is annotated with where it came from. Nothing is
 * recalled from memory: endpoints, quota costs and field limits all change, and
 * a wrong constant here becomes a wrong request to a live channel.
 *
 * Where a limit could not be verified against current official documentation,
 * **it is not asserted** — the same stance Stage 3 took on caption lengths. An
 * unverified limit enforced as though it were real rejects content the platform
 * would have accepted.
 *
 * Sources (see docs/stage-7-youtube.md for the full record, including which
 * pages were reachable from this environment and which were read via search
 * summaries because the proxy blocked developers.google.com):
 *
 * - Using OAuth 2.0 for Web Server Applications
 * - YouTube Data API — Videos: insert
 * - YouTube Data API — Thumbnails: set
 * - YouTube Data API — PlaylistItems: insert
 * - YouTube Data API — Channels: list
 * - YouTube Data API — Quota costs
 */

// ---------------------------------------------------------------------------
// OAuth 2.0
// ---------------------------------------------------------------------------

/** Where the owner is sent to grant access. */
export const GOOGLE_AUTH_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";

/** Where an authorisation code, or a refresh token, is exchanged. */
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Where a token is revoked at Google's end, not merely forgotten at ours. */
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * The scopes this application requests.
 *
 * Deliberately three and not more:
 *
 * - `youtube.upload` is the narrowest scope that can insert a video.
 * - `youtube.readonly` is needed to discover the channel after authorisation —
 *   without it, a connection could not say *which* channel it connected.
 * - `youtube` is needed for `playlistItems.insert`, because adding a video to
 *   a playlist modifies the channel and upload-only cannot do it.
 *
 * `youtubepartner` and `youtube.force-ssl` are **not** requested. They grant
 * far more than this product does, and an unused broad scope is a standing
 * risk with no benefit.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube",
] as const;

export type YouTubeScope = (typeof YOUTUBE_SCOPES)[number];

/** The scope without which nothing can be uploaded at all. */
export const UPLOAD_SCOPE: YouTubeScope =
  "https://www.googleapis.com/auth/youtube.upload";

/**
 * The YouTube Analytics API, and the scope that opens it.
 *
 * A different service from the Data API this module otherwise describes, and
 * deliberately **not** in `YOUTUBE_SCOPES`: Stage 7 asked for upload, readonly
 * and manage, none of which grants analytics. Adding it there would silently
 * widen an existing consent screen, so it lives apart and Stage 10 asks for it
 * as an explicit, separate grant.
 *
 * Both constants live here rather than in `src/lib/analytics` because every
 * platform hostname in this codebase is confined to its integration module —
 * a property `tests/unit/workflow-safety.test.ts` enforces across the tree.
 */
export const YOUTUBE_ANALYTICS_BASE =
  "https://youtubeanalytics.googleapis.com/v2/reports";

export const YOUTUBE_ANALYTICS_SCOPE =
  "https://www.googleapis.com/auth/yt-analytics.readonly";

/** The scope `playlistItems.insert` needs. */
export const PLAYLIST_SCOPE: YouTubeScope =
  "https://www.googleapis.com/auth/youtube";

/**
 * A scope's short name, for display.
 *
 * Lives here rather than in the component so no page or component ever needs
 * to write a platform hostname — which is what lets the source-wide guard in
 * `tests/unit/workflow-safety.test.ts` keep every mention of a platform host
 * confined to this module.
 */
export function shortScopeName(scope: string): string {
  const marker = "/auth/";
  const index = scope.lastIndexOf(marker);
  return index === -1 ? scope : scope.slice(index + marker.length);
}

/**
 * How long an OAuth state token stays valid.
 *
 * An authorisation round trip is a minute's work. A state that outlives the
 * flow is a replay window.
 */
export const OAUTH_STATE_TTL_SECONDS = 600;

// ---------------------------------------------------------------------------
// API endpoints
// ---------------------------------------------------------------------------

export const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * The resumable upload endpoint.
 *
 * A different host prefix from the API base: uploads go to `/upload/...`.
 * Sending a resumable initiation to the ordinary base returns a confusing
 * error rather than an upload session.
 */
export const YOUTUBE_UPLOAD_BASE =
  "https://www.googleapis.com/upload/youtube/v3";

// ---------------------------------------------------------------------------
// Quota
// ---------------------------------------------------------------------------

/**
 * Quota cost per call, in units.
 *
 * A default project allowance is 10,000 units a day, which makes an upload
 * (1,600 units) expensive: **six uploads a day exhausts a default quota.**
 * That is not a limit this code can raise — it is raised by applying to Google
 * — but it is a limit worth showing the owner rather than discovering as a
 * mid-afternoon failure.
 */
export const QUOTA_COST = {
  videosInsert: 1600,
  thumbnailsSet: 50,
  playlistItemsInsert: 50,
  channelsList: 1,
  videosList: 1,
  playlistsList: 1,
} as const;

/** The default daily allowance for a new project, in units. */
export const DEFAULT_DAILY_QUOTA_UNITS = 10_000;

/** How many uploads a day a default quota allows, if it did nothing else. */
export const UPLOADS_PER_DEFAULT_QUOTA = Math.floor(
  DEFAULT_DAILY_QUOTA_UNITS / QUOTA_COST.videosInsert,
);

// ---------------------------------------------------------------------------
// Field limits
// ---------------------------------------------------------------------------

/**
 * Limits documented for `videos.insert`.
 *
 * `description` is documented in **bytes**, not characters — an emoji costs
 * four. Measuring it as characters would accept a description the API then
 * rejects, so it is measured as bytes here.
 */
export const YOUTUBE_LIMITS = {
  titleCharacters: 100,
  descriptionBytes: 5000,
  /** Combined across all tags, not per tag. */
  tagsTotalCharacters: 500,
  thumbnailBytes: 2 * 1024 * 1024,
} as const;

/** MIME types `thumbnails.set` accepts. */
export const THUMBNAIL_MIME_TYPES = ["image/jpeg", "image/png"] as const;

/**
 * Characters YouTube rejects in a title or description.
 *
 * Angle brackets are refused outright by `videos.insert`; a title containing
 * one fails the whole upload after the bytes have been sent, which is an
 * expensive way to find out.
 */
export const FORBIDDEN_TEXT_CHARACTERS = /[<>]/;

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export const PRIVACY_STATUSES = ["private", "unlisted", "public"] as const;
export type PrivacyStatus = (typeof PRIVACY_STATUSES)[number];

export const PRIVACY_LABELS: Record<PrivacyStatus, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
};

/**
 * The privacy statuses this application will actually request.
 *
 * **`public` is not one of them.** Google restricts API clients that have not
 * completed its compliance audit: videos uploaded through an unaudited client
 * are forced to private regardless of the `privacyStatus` sent. Offering
 * `public` in the interface would offer something the platform overrides —
 * which is exactly the "fake success" this project forbids.
 *
 * When the audit is passed, this list is where that changes, and
 * docs/stage-7-youtube.md records what the audit involves.
 */
export const REQUESTABLE_PRIVACY_STATUSES: readonly PrivacyStatus[] = [
  "private",
  "unlisted",
];

export function isRequestablePrivacy(value: PrivacyStatus): boolean {
  return REQUESTABLE_PRIVACY_STATUSES.includes(value);
}

/**
 * `status.publishAt` — a scheduled public release.
 *
 * Documented as usable only when `privacyStatus` is `private` and the video
 * has never been published. Since this client cannot request `public` at all,
 * scheduled release is **not offered**: setting `publishAt` on a video that an
 * unaudited client forced private would promise a release that never happens.
 */
export const SCHEDULED_RELEASE_AVAILABLE = false;

// ---------------------------------------------------------------------------
// Shorts
// ---------------------------------------------------------------------------

/**
 * How a Short is created.
 *
 * **There is no API field that makes a video a Short.** No parameter of
 * `videos.insert` requests it and no response field confirms it. YouTube
 * classifies a video as a Short from the uploaded file itself — a vertical or
 * square aspect ratio and a short duration — after processing.
 *
 * So this application cannot promise a Short, and does not claim to. It
 * uploads a video whose composition was built for the format, and reports what
 * it actually knows: that the file meets the shape YouTube looks for, not that
 * YouTube agreed.
 *
 * The duration threshold has been raised by YouTube more than once and is a
 * product rule rather than an API contract, so it is **guidance shown to the
 * owner, not a rule enforced here.** Enforcing an unverified threshold would
 * reject uploads YouTube would have accepted.
 */
export const SHORTS_CLASSIFICATION_IS_AUTOMATIC = true;

/** Aspect ratios YouTube treats as Shorts-shaped. */
export const SHORTS_ASPECT_RATIOS = ["9:16", "1:1"] as const;

export const SHORTS_GUIDANCE =
  "YouTube decides what is a Short after processing, from the file's shape and length. This upload can meet those conditions but cannot request the classification — no API field exists for it.";
