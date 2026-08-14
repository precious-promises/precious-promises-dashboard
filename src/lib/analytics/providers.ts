import { YOUTUBE_ANALYTICS_SCOPE } from "@/lib/youtube/config";
import type { VariantPlatform } from "@/lib/variants/types";

import type {
  MetricName,
  MetricSource,
  ObservationWindow,
  UnavailableReason,
} from "./types";

/**
 * The analytics provider contract.
 *
 * **Deliberately separate from the publishing providers.** They answer
 * different questions, fail for different reasons, and — most importantly — an
 * analytics failure must never be able to touch a publish record. A platform
 * that cannot find a two-year-old video is telling us about its retention
 * policy, not about whether that video was published.
 *
 * The separation is structural rather than conventional: nothing in this
 * module imports `@/lib/publishing`, and no method here returns anything a
 * publish path could act on.
 */

// ---------------------------------------------------------------------------
// What each platform actually reports
// ---------------------------------------------------------------------------

/**
 * The capability matrix, read from official documentation in August 2026.
 *
 * This is the single place that decides whether a metric can be asked for at
 * all. A metric absent here renders as "not reported by this platform" rather
 * than as zero, which is the difference between describing a platform's
 * limitation and describing Dave's ministry as a failure.
 */
export interface PlatformAnalyticsCapability {
  platform: VariantPlatform;
  /** Whether an adapter exists at all. A fact about this repository. */
  implemented: boolean;
  source: MetricSource | null;
  /** Metrics this platform genuinely reports, per official documentation. */
  metrics: readonly MetricName[];
  /** Additional OAuth scopes needed beyond what publishing already holds. */
  additionalScopes: readonly string[];
  /** Why it is unavailable, when it is. */
  unavailableReason: UnavailableReason | null;
  detail: string;
}

/**
 * YouTube — the richest of the three.
 *
 * The YouTube Analytics API (`yt-analytics.readonly`) reports genuine watch
 * time and average view duration, which neither of the others matches. Note
 * that `saves` and `reach` are absent: YouTube has no equivalent, and asking
 * for one would return an error rather than a zero.
 */
const YOUTUBE_CAPABILITY: PlatformAnalyticsCapability = {
  platform: "youtube",
  implemented: true,
  source: "youtube_api",
  metrics: [
    "views_or_plays",
    "watch_time_seconds",
    "average_view_duration_seconds",
    "likes",
    "comments",
    "shares",
    "followers_gained",
  ],
  // A genuinely new scope. Stage 7 asked for upload, readonly and manage —
  // none of which grants analytics — so this needs fresh consent and the
  // interface says so rather than expanding the request silently.
  additionalScopes: [YOUTUBE_ANALYTICS_SCOPE],
  unavailableReason: null,
  detail:
    "The YouTube Analytics API reports views, watch time, average view duration, likes, comments, shares and subscribers gained. It needs the yt-analytics.readonly scope, which the publishing connection does not include — reconnecting and granting it is a separate, explicit step.",
};

/**
 * Instagram — fewer metrics, and a moving target.
 *
 * Meta replaced `impressions` with `views` across the Insights API: requests
 * for `impressions` on media created after 2 July 2024 return an error rather
 * than a figure. This adapter asks for `views` and records `views` as the raw
 * name, so the stored provenance matches what Meta actually answered.
 *
 * **No watch time.** Meta does not expose a watch-time or average-watch-time
 * metric through the Instagram API with Instagram Login, so this application
 * does not display one for Instagram — rather than showing a zero, or worse,
 * quietly filling the column with a YouTube figure.
 */
const INSTAGRAM_CAPABILITY: PlatformAnalyticsCapability = {
  platform: "instagram",
  implemented: true,
  source: "instagram_api",
  metrics: ["views_or_plays", "likes", "comments", "shares", "saves", "reach"],
  // Media insights come through the same Instagram Login connection Stage 8
  // established; the publishing scopes already cover reading them back.
  additionalScopes: [],
  unavailableReason: null,
  detail:
    "Instagram Insights reports views (which replaced impressions), reach, likes, comments, shares and saves for Reels. It reports no watch-time metric through this API, so no watch time is shown for Instagram. Accounts under 100 followers may receive no insights at all, and Meta retains user-level insight data for 90 days.",
};

/**
 * TikTok — **not supported, and not for want of trying.**
 *
 * The Display API (`video.list` / `video.query`) returns metadata only: id,
 * title, description, duration, cover image, embed link and share URL. The
 * engagement fields — view count, like count, comment count, share count —
 * live in TikTok's **Research API**, which is restricted to qualifying
 * academic institutions and registered non-profits in specific regions, and
 * requires an approved research proposal with ethical review.
 *
 * Precious Promises is a ministry, not an academic research institution, and
 * would not qualify. So there is no TikTok analytics connector here: writing
 * one against an API this application cannot legitimately access would be
 * building a door with no key and calling the room furnished.
 *
 * Manual entry remains available, clearly labelled as manual and never mixed
 * with API figures.
 */
const TIKTOK_CAPABILITY: PlatformAnalyticsCapability = {
  platform: "tiktok",
  implemented: false,
  source: null,
  metrics: [],
  additionalScopes: [],
  unavailableReason: "provider_not_supported",
  detail:
    "TikTok's Display API returns video metadata only — no view, like, comment or share counts. Those figures are available solely through TikTok's Research API, which is limited to qualifying academic institutions and non-profits with an approved research proposal and ethical review, and which Precious Promises would not qualify for. No TikTok analytics connector has been built. Figures can be entered by hand and are labelled as such.",
};

export const PLATFORM_ANALYTICS_CAPABILITIES: readonly PlatformAnalyticsCapability[] =
  [YOUTUBE_CAPABILITY, INSTAGRAM_CAPABILITY, TIKTOK_CAPABILITY];

export function analyticsCapabilityFor(
  platform: VariantPlatform,
): PlatformAnalyticsCapability {
  return (
    PLATFORM_ANALYTICS_CAPABILITIES.find(
      (capability) => capability.platform === platform,
    ) ?? {
      platform,
      implemented: false,
      source: null,
      metrics: [],
      additionalScopes: [],
      unavailableReason: "provider_not_supported",
      detail: "No analytics adapter exists for this platform.",
    }
  );
}

/** Whether this platform is documented to report this metric at all. */
export function reportsMetric(
  platform: VariantPlatform,
  metric: MetricName,
): boolean {
  return analyticsCapabilityFor(platform).metrics.includes(metric);
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/** One post's figures, as a provider returns them. */
export interface FetchedPostMetrics {
  externalPostId: string;
  window: ObservationWindow;
  /** When the platform says the figures describe. */
  observedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  /**
   * The figures, keyed by canonical name, each carrying the platform's own
   * name for it. A metric the platform did not return is simply absent —
   * never present with a zero.
   */
  values: Partial<Record<MetricName, { value: number; rawName: string }>>;
}

/** Why an analytics fetch failed. Kept apart from publishing's categories. */
export const ANALYTICS_ERROR_CATEGORIES = [
  "account_disconnected",
  "permission_missing",
  "token_expired",
  "rate_limited",
  "provider_unavailable",
  "unsupported_metric",
  "invalid_external_id",
  "post_unavailable",
  "transient",
  "unknown",
] as const;

export type AnalyticsErrorCategory =
  (typeof ANALYTICS_ERROR_CATEGORIES)[number];

export const ANALYTICS_ERROR_LABELS: Record<AnalyticsErrorCategory, string> = {
  account_disconnected: "Account disconnected",
  permission_missing: "Analytics permission missing",
  token_expired: "Authorisation expired",
  rate_limited: "Rate limited",
  provider_unavailable: "Platform unavailable",
  unsupported_metric: "Metric not supported",
  invalid_external_id: "Unknown post id",
  post_unavailable: "Post no longer reachable",
  transient: "Temporary problem",
  unknown: "Unknown problem",
};

/**
 * Which failures are worth trying again.
 *
 * Conservative on purpose, and **`unknown` is not retryable** — the same rule
 * the publishing layer follows. A failure nobody has classified is not
 * evidence that repeating it will help.
 */
export const RETRYABLE_ANALYTICS_ERRORS: readonly AnalyticsErrorCategory[] = [
  "rate_limited",
  "provider_unavailable",
  "transient",
];

export function isRetryableAnalyticsError(
  category: AnalyticsErrorCategory,
): boolean {
  return RETRYABLE_ANALYTICS_ERRORS.includes(category);
}

/**
 * Failures that mean the post is gone rather than the fetch was wrong.
 *
 * These mark external availability and **never** touch the publish record. A
 * deleted video was still published; erasing that would be rewriting history
 * because a third party tidied up.
 */
export const POST_GONE_ERRORS: readonly AnalyticsErrorCategory[] = [
  "invalid_external_id",
  "post_unavailable",
];

export interface AnalyticsFetchFailure {
  ok: false;
  category: AnalyticsErrorCategory;
  detail: string;
}

/**
 * One post that could not be read while the rest of the batch could.
 *
 * Providers whose platform answers per post (Instagram) report these so a
 * mixed outcome reaches the sync run as `partial` — a batch where one Reel
 * failed must never be recorded as a complete success.
 */
export interface PostFetchFailure {
  externalPostId: string;
  category: AnalyticsErrorCategory;
}

export type AnalyticsFetchResult =
  | { ok: true; metrics: FetchedPostMetrics[]; failures?: PostFetchFailure[] }
  | AnalyticsFetchFailure;

export interface AnalyticsFetchRequest {
  ownerId: string;
  accessToken: string;
  /** The platform's own ids for the posts to ask about. */
  externalPostIds: string[];
  window: ObservationWindow;
  /** For windowed reports. Null for lifetime. */
  periodStart: Date | null;
  periodEnd: Date | null;
  fetchImpl?: typeof fetch;
}

export interface AnalyticsProvider {
  readonly platform: VariantPlatform;
  readonly source: MetricSource;

  /** Metrics this provider can genuinely return. */
  readonly metrics: readonly MetricName[];

  /** Fetch figures for a batch of posts. Never throws for a platform refusal. */
  fetch(request: AnalyticsFetchRequest): Promise<AnalyticsFetchResult>;
}

/**
 * The registry.
 *
 * TikTok is absent, and callers must handle the absence — which is what makes
 * "this platform reports nothing we can read" impossible to forget at the call
 * site, exactly as the publishing registry did for platforms without adapters.
 */
const REGISTRY: Partial<Record<VariantPlatform, () => AnalyticsProvider>> = {};

export function registerAnalyticsProvider(
  platform: VariantPlatform,
  factory: () => AnalyticsProvider,
): void {
  REGISTRY[platform] = factory;
}

export function getAnalyticsProvider(
  platform: VariantPlatform,
): AnalyticsProvider | null {
  const factory = REGISTRY[platform];
  return factory ? factory() : null;
}

export function analyticsProviderExists(platform: VariantPlatform): boolean {
  return REGISTRY[platform] !== undefined;
}
