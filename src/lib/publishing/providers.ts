import type { ContentItem } from "@/lib/content/types";
import type { ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant, VariantPlatform } from "@/lib/variants/types";

import type { ErrorCategory, SafeError } from "./errors";

/**
 * The publishing provider contract.
 *
 * **No provider exists.** `getPublishingProvider` returns `null` for every
 * platform, deliberately and not as a placeholder to be filled with a stub. A
 * stub returning a plausible post id would be indistinguishable from a working
 * integration at the call site — and would put a fabricated success in the
 * database, which is the exact failure the project rules forbid.
 *
 * Stage 7 adds YouTube as the first real implementation.
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
  available: false;
  detail: string;
}

/**
 * Every platform, and why none of them can publish.
 *
 * Shown in the interface verbatim. `available` is typed as `false` rather than
 * `boolean`, so making one available is a deliberate type change that the
 * compiler will surface everywhere it matters.
 */
export const PROVIDER_STATUS: readonly ProviderStatus[] = [
  {
    platform: "youtube",
    available: false,
    detail:
      "No YouTube connection. OAuth and the Data API arrive in Stage 7; nothing can be uploaded yet.",
  },
  {
    platform: "instagram",
    available: false,
    detail:
      "No Instagram connection. The Graph API integration and its app review are not built.",
  },
  {
    platform: "tiktok",
    available: false,
    detail: "No TikTok connection. The Content Posting API is not built.",
  },
] as const;

/**
 * The configured provider for a platform, or `null`.
 *
 * Returns `null` for every platform in Stage 6. Callers must handle the
 * absence, which is what makes "publishing is not connected" impossible to
 * forget at the call site.
 */
const PROVIDER_REGISTRY: Partial<Record<VariantPlatform, PublishingProvider>> =
  {
    // Empty on purpose. Stage 7 adds YouTube here, and that one line is the
    // whole change — every call site already handles the absence, because it
    // has had to since this registry was written.
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
      available: false,
      detail: "No connection to this platform.",
    }
  );
}

/** True when at least one platform could publish. False throughout Stage 6. */
export function anyProviderAvailable(): boolean {
  return PROVIDER_STATUS.some((status) => status.available);
}
