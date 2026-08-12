import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant, VariantPlatform } from "@/lib/variants/types";
import { instagramProvider } from "@/lib/instagram/provider";
import { tiktokProvider } from "@/lib/tiktok/provider";
import { youtubeProvider } from "@/lib/youtube/provider";

import type { ErrorCategory, SafeError } from "./errors";

/**
 * The publishing provider contract.
 *
 * All three platforms now have an adapter, and every one of them is real in the
 * sense that matters: every request is a genuine request to the platform, and
 * success is reported only when the platform returned an id for the post.
 *
 * `getPublishingProvider` still returns `null` for a platform with no adapter,
 * and callers still have to handle that — which is what made adding each
 * provider a change to one line here rather than a change everywhere. The
 * absence was never a placeholder waiting for a stub: a stub returning a
 * plausible post id would be indistinguishable from a working integration at
 * the call site, and would put a fabricated success in the database.
 */

/** Everything a provider needs, with no database or HTTP types in it. */
export interface PublishRequest {
  scheduledPost: ScheduledPost;
  variant: PlatformVariant;
  item: ContentItem;
  /** The identity of this operation, for the provider's own deduplication. */
  idempotencyKey: string;
}

/**
 * A genuine platform success.
 *
 * `externalPostId` is required and unfakeable: it is what the platform called
 * the post. Without one there is no success to report, and both
 * `scheduled_posts` and `publish_attempts` refuse the row.
 */
export interface PublishSucceeded {
  outcome: "succeeded";
  externalPostId: string;
  externalPostUrl: string | null;
}

export interface PublishFailed {
  outcome: "failed";
  error: SafeError;
}

/**
 * The provider reached a real but incomplete state.
 *
 * Some platforms can only be driven as far as a draft, or need the owner to
 * finish by hand. Forcing that into "succeeded" would claim something went
 * live that did not.
 */
export interface PublishIncomplete {
  outcome: "incomplete";
  state: "ready_for_manual_post" | "uploaded_to_platform_draft";
  externalPostId: string | null;
  detail: string;
}

export type PublishResult =
  PublishSucceeded | PublishFailed | PublishIncomplete;

export interface ReadinessProblem {
  code: ErrorCategory;
  message: string;
}

/**
 * What a platform integration must provide.
 *
 * Capabilities are optional where platforms genuinely differ — `reconcile` in
 * particular, because not every platform lets you look up a post you may have
 * created. Forcing every provider to implement it would mean writing a fake
 * one somewhere.
 */
export interface PublishingProvider {
  readonly platform: VariantPlatform;

  /** Whether credentials and a connected account exist. */
  isConnected(): Promise<boolean>;

  /** Platform-specific readiness beyond the generic safety gate. */
  validateReadiness(request: PublishRequest): Promise<ReadinessProblem[]>;

  /** Build whatever the platform's API expects. Never returns credentials. */
  preparePayload(request: PublishRequest): Promise<unknown>;

  /** Attempt the publish. Must only report success with a real post id. */
  publish(request: PublishRequest): Promise<PublishResult>;

  /**
   * Look up a post this operation may already have created.
   *
   * Optional: only platforms that support querying by an idempotency token
   * can implement it honestly.
   */
  reconcile?(idempotencyKey: string): Promise<PublishSucceeded | null>;

  /** Turn a platform error into a category this system understands. */
  classifyError(error: unknown): SafeError;
}

export interface ProviderStatus {
  platform: VariantPlatform;
  /** Whether an adapter exists at all — not whether it is connected. */
  implemented: boolean;
  detail: string;
}

/**
 * Every platform, and what exists for it.
 *
 * Shown in the interface verbatim. `implemented` means an adapter has been
 * written, **not** that an account is connected or that a publish would
 * succeed — the first is a fact about this repository, the second is a fact
 * about Dave's Google account, and conflating them is how an interface starts
 * lying.
 */
export const PROVIDER_STATUS: readonly ProviderStatus[] = [
  {
    platform: "youtube",
    implemented: true,
    detail:
      "A YouTube adapter exists and makes real requests to the Data API. It refuses with media_source_unavailable until a storage integration can supply the video file.",
  },
  {
    platform: "instagram",
    implemented: true,
    detail:
      "An Instagram adapter exists and publishes Reels by uploading bytes directly to Meta. Images and carousels are refused: Meta fetches those from a publicly reachable URL, and this application will not expose media to the open internet.",
  },
  {
    platform: "tiktok",
    implemented: true,
    detail:
      "A TikTok adapter exists and uses the Content Posting API. It can post directly, upload to your TikTok drafts, or prepare a manual post — and it reports each of those as what it is rather than calling them all success.",
  },
] as const;

/**
 * The configured provider for a platform, or `null`.
 *
 * Every platform has one now, but the type stays `Partial` and callers still
 * handle the absence: that is what made "this platform is not connected"
 * impossible to forget at the call site, and it is what will catch the next
 * platform added to `VariantPlatform` before an adapter is written for it.
 */
const PROVIDER_REGISTRY: Partial<Record<VariantPlatform, PublishingProvider>> =
  {
    youtube: youtubeProvider,
    instagram: instagramProvider,
    tiktok: tiktokProvider,
  };

export function getPublishingProvider(
  platform: VariantPlatform,
): PublishingProvider | null {
  return PROVIDER_REGISTRY[platform] ?? null;
}

export function providerStatusFor(platform: VariantPlatform): ProviderStatus {
  return (
    PROVIDER_STATUS.find((status) => status.platform === platform) ?? {
      platform,
      implemented: false,
      detail: "No connection to this platform.",
    }
  );
}

/** True when at least one platform has an adapter. */
export function anyProviderImplemented(): boolean {
  return PROVIDER_STATUS.some((status) => status.implemented);
}
