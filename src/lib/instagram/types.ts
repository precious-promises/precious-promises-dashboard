import type { InstagramMediaType } from "./config";

/**
 * Instagram domain types.
 *
 * The distinction that runs through all of them: **a container is not a post.**
 * Meta's publishing is two-phase — a container is created and processed, and
 * only a separate publish call produces a media id. Treating the container id
 * as proof of publication would report posts that never happened.
 */

/** The stored, owner-editable Instagram settings for one platform variant. */
export interface InstagramMediaMetadata {
  id: string;
  owner_id: string;
  platform_variant_id: string;
  media_type: InstagramMediaType;
  cover_media_asset_id: string | null;
  share_to_feed: boolean;
  created_at: string;
  updated_at: string;
}

/** The connected Instagram professional account. */
export interface InstagramAccount {
  id: string;
  username: string;
  accountType: string | null;
}

/**
 * Meta's documented container states.
 *
 * `FINISHED` means ready to publish — **not** published. `PUBLISHED` is only
 * reached after the separate publish call succeeds.
 */
export const CONTAINER_STATUSES = [
  "in_progress",
  "finished",
  "published",
  "error",
  "expired",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  in_progress: "Meta is processing the upload",
  finished: "Processed and ready to publish — not yet published",
  published: "Published, with Meta's own media id",
  error: "Meta could not process it",
  expired: "The container expired before it was published",
};

/**
 * Map Meta's `status_code` onto our vocabulary.
 *
 * Mapped rather than stored raw, so an unfamiliar value becomes `in_progress`
 * — "we do not know yet" — rather than an invented conclusion. Notably, an
 * unknown value must never become `finished`, because `finished` is what
 * permits a publish call.
 */
export function mapContainerStatus(code: string | null): ContainerStatus {
  switch (code) {
    case "FINISHED":
      return "finished";
    case "PUBLISHED":
      return "published";
    case "ERROR":
      return "error";
    case "EXPIRED":
      return "expired";
    case "IN_PROGRESS":
    default:
      return "in_progress";
  }
}

/** A container as this system records it. No token, no upload URL. */
export interface ContainerRecord {
  id: string;
  owner_id: string;
  scheduled_post_id: string;
  idempotency_key: string;
  container_id: string;
  media_type: InstagramMediaType;
  status: ContainerStatus;
  published_media_id: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A published post's permalink.
 *
 * **Cannot be constructed.** An Instagram URL uses a shortcode, which is not
 * the media id and cannot be derived from it — `instagram.com/p/<media id>/`
 * is simply a broken link. The permalink is read back from Meta with the media
 * resource, and when Meta does not return one this stays `null`.
 *
 * A fabricated link is a small lie with a real cost: it would sit in the
 * Publish Queue looking like proof, and lead nowhere.
 */
export function permalinkFrom(media: {
  permalink?: string | null;
}): string | null {
  const permalink = media.permalink;
  return typeof permalink === "string" && permalink.startsWith("https://")
    ? permalink
    : null;
}
