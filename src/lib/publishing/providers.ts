import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant, VariantPlatform } from "@/lib/variants/types";
import { instagramProvider } from "@/lib/instagram/provider";
import { youtubeProvider } from "@/lib/youtube/provider";

import type { ErrorCategory, SafeError } from "./errors";

/**
 * The publishing provider contract.
 *
 * **YouTube is the only implementation, and Instagram and TikTok have none.**
 * `getPublishingProvider` returns `null` for those two, deliberately and not
 * as a placeholder to be filled with a stub. A stub returning a plausible post
 * id would be indistinguishable from a working integration at the call site —
 * and would put a fabricated success in the database, which is the exact
 * failure the project rules forbid.
 *
 * The YouTube provider is real in the sense that matters: every request it
 * makes is a genuine request to Google, and it reports success only when
 * YouTube returned a video id. It does not currently reach that point,
 * because no storage integration exists to fetch the video file — it refuses
 * with `media_source_unavailable` instead. See `@/lib/youtube/media-source`.
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
    implemented: false,
    detail: "No TikTok connection. The Content Posting API is not built.",
  },
] as const;

/**
 * The configured provider for a platform, or `null`.
 *
 * Instagram and TikTok return `null`, and callers must handle the absence —
 * which is what makes "this platform is not connected" impossible to forget at
 * the call site. It has been that way since this registry was written, so
 * adding YouTube changed nothing anywhere else.
 */
const PROVIDER_REGISTRY: Partial<Record<VariantPlatform, PublishingProvider>> =
  {
    youtube: youtubeProvider,
    instagram: instagramProvider,
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
