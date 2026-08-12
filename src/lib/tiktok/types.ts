import type { DeliveryMode, PrivacyLevel } from "./config";

/**
 * TikTok domain types.
 *
 * The distinction running through all of them: **a draft is not a post, and an
 * accepted upload is not a publication.** TikTok's flow has several states
 * that feel like success and are not, so each is named separately.
 */

/** The stored, owner-chosen TikTok settings for one platform variant. */
export interface TikTokVideoMetadata {
  id: string;
  owner_id: string;
  platform_variant_id: string;
  /** `null` until the owner picks one TikTok said this creator may use. */
  privacy_level: PrivacyLevel | null;
  disable_comment: boolean;
  disable_duet: boolean;
  disable_stitch: boolean;
  is_commercial_content: boolean;
  is_branded_content: boolean;
  is_your_brand: boolean;
  delivery_mode: DeliveryMode;
  created_at: string;
  updated_at: string;
}

/**
 * What TikTok says this creator is allowed to do.
 *
 * Queried per creator, never assumed. The privacy options in particular are
 * the **only** values that may be offered: TikTok refuses anything else, and
 * for an unaudited client it simply does not return the public ones.
 */
export interface CreatorInfo {
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  privacyLevelOptions: PrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number | null;
}

/**
 * TikTok's publish lifecycle, mapped into our vocabulary.
 *
 * `PUBLISH_COMPLETE` is the only state that means a post exists. Everything
 * else is either in flight or a failure, and an **unrecognised** status maps
 * to `processing` — never to success.
 */
export const PUBLISH_STATUSES = [
  "initialised",
  "uploading",
  "processing",
  "published",
  "uploaded_to_draft",
  "failed",
  "expired",
] as const;

export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  initialised: "Initialised with TikTok",
  uploading: "Uploading to TikTok",
  processing: "TikTok is processing it",
  published: "Posted, with TikTok's own post id",
  uploaded_to_draft: "In your TikTok drafts — not posted",
  failed: "TikTok could not publish it",
  expired: "The upload expired before it completed",
};

/**
 * Map TikTok's `status` onto ours.
 *
 * Deliberately conservative. An unfamiliar value becomes `processing` — "we do
 * not know yet" — because `published` is what permits writing `posted`, and a
 * guess there would claim a post nobody has seen.
 *
 * `mode` matters: the same `PUBLISH_COMPLETE` means a live post for a direct
 * post, and a finished **draft** for an inbox upload.
 */
export function mapPublishStatus(
  status: string | null,
  mode: "direct_post" | "inbox",
): PublishStatus {
  switch (status) {
    case "PUBLISH_COMPLETE":
      return mode === "direct_post" ? "published" : "uploaded_to_draft";
    case "FAILED":
      return "failed";
    case "PROCESSING_UPLOAD":
    case "PROCESSING_DOWNLOAD":
    case "SEND_TO_USER_INBOX":
      return "processing";
    default:
      return "processing";
  }
}

/**
 * A publish session as this system records it.
 *
 * `uploadUrl` is deliberately absent. TikTok's upload URL is a bearer
 * capability — anyone holding it can push bytes into that upload — so it never
 * appears on a type that might be rendered, logged or serialised.
 */
export interface PublishSessionRecord {
  id: string;
  owner_id: string;
  scheduled_post_id: string;
  idempotency_key: string;
  publish_id: string;
  delivery_mode: "direct_post" | "inbox";
  video_size_bytes: number | null;
  chunk_size_bytes: number | null;
  total_chunk_count: number | null;
  chunks_sent: number;
  status: PublishStatus;
  external_post_id: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A TikTok post's URL.
 *
 * Built from the creator's username and TikTok's own post id — both of which
 * this system genuinely holds after a successful direct post. Returns `null`
 * without them rather than guessing a link that would lead nowhere.
 *
 * A leading `@` is stripped first. The account row stores the handle **with**
 * one, and TikTok's URL format supplies its own — encoding the stored `@` would
 * produce `/@%40name`, which is a link to nothing.
 */
export function postUrl(
  username: string | null,
  postId: string | null,
): string | null {
  const handle = (username ?? "").trim().replace(/^@+/, "");

  if (handle === "" || !postId) {
    return null;
  }
  return `https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(postId)}`;
}
