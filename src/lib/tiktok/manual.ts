import type { ContentItem } from "@/lib/content/types";
import type { MediaAsset } from "@/lib/media/types";
import type { PlatformVariant } from "@/lib/variants/types";

import { DELIVERY_MODE_LABELS, PRIVACY_LEVEL_LABELS } from "./config";
import { buildCaption } from "./metadata";
import type { TikTokVideoMetadata } from "./types";

/**
 * Everything Dave needs to post to TikTok by hand.
 *
 * The manual fallback exists because TikTok's direct posting needs an audit
 * this application may not have, and because a connection may be granted
 * without the publish scope. Neither is a reason to leave him with nothing.
 *
 * **This is not publishing.** Nothing here sends anything anywhere. It is a
 * transcription of what was approved, in the order TikTok's own composer asks
 * for it, so that what he posts by hand is exactly what he approved rather
 * than something retyped from memory.
 *
 * Pure — no database, no network — so the whole kit is testable and cannot
 * accidentally touch a platform.
 */

export interface ManualPostMedia {
  /** The filename as Drive holds it. */
  filename: string | null;
  /** Where it lives, in words rather than a URL. */
  location: string;
  /** Whether the file can genuinely be reached right now. */
  ready: boolean;
  reason: string | null;
}

export interface ManualPostSetting {
  label: string;
  value: string;
  /** Set when the value is a legal declaration rather than a preference. */
  declaration?: boolean;
}

export interface ManualPostKit {
  /** The full caption, exactly as an automated post would have sent it. */
  caption: string;
  /** Hashtags on their own, for pasting separately if TikTok's composer wants. */
  hashtags: string[];
  settings: ManualPostSetting[];
  media: ManualPostMedia;
  checklist: string[];
}

function mediaFor(asset: MediaAsset | null): ManualPostMedia {
  if (asset === null) {
    return {
      filename: null,
      location: "No media asset is attached to this content.",
      ready: false,
      reason: "Attach the video before posting.",
    };
  }

  if (asset.storage_provider !== "google_drive") {
    return {
      filename: asset.name,
      location: `Recorded as living in ${asset.storage_provider}.`,
      ready: false,
      reason:
        "This dashboard can only locate files in the approved Google Drive folder.",
    };
  }

  return {
    filename: asset.name,
    // Deliberately not a link. A URL here would either be a Drive link that
    // only works for someone already signed in, or a public one this
    // application will not create.
    location:
      "In the approved Precious Promises Content folder in Google Drive.",
    ready: true,
    reason: null,
  };
}

/**
 * Build the manual posting kit.
 *
 * The caption is built by the **same** function the provider would have used,
 * so a manual post and an automated one carry identical wording — including
 * the Scripture block, quoted exactly as stored and kept structurally separate
 * from the commentary around it.
 */
export function buildManualPostKit(input: {
  variant: PlatformVariant;
  item: ContentItem;
  metadata: TikTokVideoMetadata | null;
  asset: MediaAsset | null;
}): ManualPostKit {
  const { variant, item, metadata, asset } = input;

  const caption = buildCaption(variant, item);
  const hashtags = (variant.hashtags ?? []).filter((tag) => tag.trim() !== "");
  const media = mediaFor(asset);

  const settings: ManualPostSetting[] = [];

  if (metadata !== null) {
    settings.push({
      label: "Intended delivery",
      value: DELIVERY_MODE_LABELS[metadata.delivery_mode],
    });

    settings.push({
      label: "Audience",
      value:
        metadata.privacy_level === null
          ? "Not chosen — pick one in the TikTok app"
          : PRIVACY_LEVEL_LABELS[metadata.privacy_level],
    });

    settings.push({
      label: "Comments",
      value: metadata.disable_comment ? "Off" : "On",
    });
    settings.push({
      label: "Duet",
      value: metadata.disable_duet ? "Off" : "On",
    });
    settings.push({
      label: "Stitch",
      value: metadata.disable_stitch ? "Off" : "On",
    });

    if (metadata.is_commercial_content) {
      settings.push({
        label: "Commercial content",
        value: "Declared",
        declaration: true,
      });
      settings.push({
        label: "Your own brand",
        value: metadata.is_your_brand ? "Yes" : "No",
        declaration: true,
      });
      settings.push({
        label: "Branded content (paid partnership)",
        value: metadata.is_branded_content ? "Yes" : "No",
        declaration: true,
      });
    } else {
      settings.push({
        label: "Commercial content",
        value: "Not declared",
        declaration: true,
      });
    }
  }

  return {
    caption,
    hashtags,
    settings,
    media,
    checklist: buildChecklist({ metadata, media, caption }),
  };
}

/**
 * The steps, in the order they have to happen.
 *
 * Written as things to verify rather than things to trust. The commercial
 * disclosure in particular is called out separately: TikTok's own toggle has
 * legal weight, and a value recorded here does not set it there.
 */
function buildChecklist(input: {
  metadata: TikTokVideoMetadata | null;
  media: ManualPostMedia;
  caption: string;
}): string[] {
  const { metadata, media, caption } = input;
  const steps: string[] = [];

  if (!media.ready) {
    steps.push(
      `Resolve the media first: ${media.reason ?? "the file cannot be located."}`,
    );
  } else {
    steps.push(
      `Open ${media.filename} from the approved Drive folder and get it onto the device you post from.`,
    );
  }

  if (caption.trim() === "") {
    steps.push(
      "There is no caption. Add one in Caption Studio before posting — nothing here should be improvised at the composer.",
    );
  } else {
    steps.push("Copy the caption below and paste it into TikTok unchanged.");
  }

  if (metadata?.privacy_level) {
    steps.push(
      `Set the audience to ${PRIVACY_LEVEL_LABELS[metadata.privacy_level]}.`,
    );
  } else {
    steps.push(
      "Choose the audience in the TikTok app. No audience was recorded here, and this dashboard will not choose one for you.",
    );
  }

  steps.push(
    "Match the interaction settings below — TikTok defaults them on, so anything recorded as Off has to be switched off by hand.",
  );

  if (metadata?.is_commercial_content) {
    steps.push(
      "Switch on TikTok's own commercial-content disclosure. It is a legal declaration, and recording it here does not set it there.",
    );
  }

  steps.push(
    "Check the Scripture on screen and in the caption reads exactly as approved before you post.",
  );

  steps.push(
    "Once it is live, mark this item as posted by hand — this dashboard did not publish it and cannot confirm it.",
  );

  return steps;
}
