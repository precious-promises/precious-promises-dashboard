import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem } from "@/lib/content/types";
import type { InstagramMediaMetadata } from "@/lib/instagram/types";
import {
  instagramSettingsDigest,
  validateForInstagram,
} from "@/lib/instagram/metadata";
import {
  loadInstagramMetadataAsWorker,
  loadInstagramMetadataFor,
} from "@/lib/instagram/repository";
import type { ReadinessProblem } from "@/lib/publishing/providers";
import { tiktokSettingsDigest, validateForTikTok } from "@/lib/tiktok/metadata";
import {
  loadTikTokMetadataAsWorker,
  loadTikTokMetadataFor,
} from "@/lib/tiktok/repository";
import type { TikTokVideoMetadata } from "@/lib/tiktok/types";
import type { PlatformVariant, VariantPlatform } from "@/lib/variants/types";
import {
  validateForYouTube,
  youtubeSettingsDigest,
} from "@/lib/youtube/metadata";
import {
  loadMetadataAsWorker,
  loadYouTubeMetadataFor,
} from "@/lib/youtube/repository";
import type { YouTubeVideoMetadata } from "@/lib/youtube/types";

/**
 * Platform settings, as the approval fingerprint sees them.
 *
 * Four places recompute a fingerprint — the approval queue, the invalidation
 * sweep, the production board and the publishing worker — and every one of them
 * must produce the **same** digest for the same variant. A fingerprint that
 * differed between the queue and the worker would either block a valid approval
 * or, far worse, let a stale one through.
 *
 * Through Stage 8 each site carried its own nested ternary over the platforms.
 * With a third platform that stopped being duplication and became a hazard:
 * adding TikTok to three of the four sites and missing the fourth would produce
 * exactly that silent disagreement. So the mapping lives here once, and adding
 * a platform is a single edit in a single file.
 */

/** Whatever a platform stores for a variant. Narrowed at the point of use. */
export type PlatformMetadata =
  YouTubeVideoMetadata | InstagramMediaMetadata | TikTokVideoMetadata | null;

/**
 * Every platform's settings for a list of variants, keyed by variant id.
 *
 * One query per platform rather than one per variant. A variant with nothing
 * saved is absent from the map, which is itself meaningful — saving settings
 * for the first time changes the fingerprint.
 */
export async function loadPlatformMetadataFor(
  variants: readonly Pick<PlatformVariant, "id" | "platform">[],
): Promise<Map<string, PlatformMetadata>> {
  const idsFor = (platform: VariantPlatform) =>
    variants.filter((v) => v.platform === platform).map((v) => v.id);

  const [youtube, instagram, tiktok] = await Promise.all([
    loadYouTubeMetadataFor(idsFor("youtube")),
    loadInstagramMetadataFor(idsFor("instagram")),
    loadTikTokMetadataFor(idsFor("tiktok")),
  ]);

  const merged = new Map<string, PlatformMetadata>();

  for (const variant of variants) {
    switch (variant.platform) {
      case "youtube":
        merged.set(variant.id, youtube.get(variant.id) ?? null);
        break;
      case "instagram":
        merged.set(variant.id, instagram.get(variant.id) ?? null);
        break;
      case "tiktok":
        merged.set(variant.id, tiktok.get(variant.id) ?? null);
        break;
      default:
        merged.set(variant.id, null);
    }
  }

  return merged;
}

/**
 * The canonical digest for one variant's settings.
 *
 * Pure, so the four fingerprint sites cannot drift: they all end up here.
 */
export function platformSettingsDigest(
  platform: VariantPlatform,
  metadata: PlatformMetadata,
): string | null {
  switch (platform) {
    case "youtube":
      return youtubeSettingsDigest(metadata as YouTubeVideoMetadata | null);
    case "instagram":
      return instagramSettingsDigest(metadata as InstagramMediaMetadata | null);
    case "tiktok":
      return tiktokSettingsDigest(metadata as TikTokVideoMetadata | null);
    default:
      return null;
  }
}

/**
 * The same digest for the worker, which has no session to filter by.
 *
 * Kept beside the session version deliberately: the two must agree, and a
 * reader checking that only has to look in one place.
 */
export async function platformSettingsDigestAsWorker(
  client: SupabaseClient,
  variant: Pick<PlatformVariant, "id" | "platform">,
  ownerId: string,
): Promise<string | null> {
  switch (variant.platform) {
    case "youtube":
      return youtubeSettingsDigest(
        await loadMetadataAsWorker(client, variant.id, ownerId),
      );
    case "instagram":
      return instagramSettingsDigest(
        await loadInstagramMetadataAsWorker(client, variant.id, ownerId),
      );
    case "tiktok":
      return tiktokSettingsDigest(
        await loadTikTokMetadataAsWorker(client, variant.id, ownerId),
      );
    default:
      return null;
  }
}

/**
 * Everything the platform would refuse about this content.
 *
 * The same dispatch, for the readiness problems shown as approval blockers. A
 * platform with no validator returns nothing rather than a guess.
 */
export function validateForPlatform(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: PlatformMetadata;
}): ReadinessProblem[] {
  const { variant, item, metadata } = input;

  switch (variant.platform) {
    case "youtube":
      return validateForYouTube({
        variant,
        item,
        metadata: metadata as YouTubeVideoMetadata | null,
      });
    case "instagram":
      return validateForInstagram({
        variant,
        item,
        metadata: metadata as InstagramMediaMetadata | null,
      });
    case "tiktok":
      return validateForTikTok({
        variant,
        item,
        metadata: metadata as TikTokVideoMetadata | null,
      });
    default:
      return [];
  }
}
