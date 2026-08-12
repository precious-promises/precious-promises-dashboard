import type { SupabaseClient } from "@supabase/supabase-js";

import { getSecretStore } from "@/lib/crypto/secrets";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { DeliveryMode } from "./config";
import type {
  PublishSessionRecord,
  PublishStatus,
  TikTokVideoMetadata,
} from "./types";

/**
 * TikTok record access.
 *
 * The same split as YouTube's and Instagram's: settings belong to the owner and
 * are read through their own session, while publish sessions are worker state
 * in a table with RLS enabled and **no policies**, reachable only by trusted
 * server code.
 *
 * The upload URL gets one extra protection the container ids did not need. It
 * is a bearer capability — anyone holding it can push bytes into that upload —
 * so it is sealed in the same AES-256-GCM envelope as an access token, and the
 * only function that opens it hands it straight to the uploader.
 */

// ---------------------------------------------------------------------------
// Settings (session credential, RLS applies)
// ---------------------------------------------------------------------------

export async function loadTikTokMetadata(
  platformVariantId: string,
): Promise<TikTokVideoMetadata | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("tiktok_video_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return (data as TikTokVideoMetadata | null) ?? null;
}

export async function loadTikTokMetadataFor(
  platformVariantIds: string[],
): Promise<Map<string, TikTokVideoMetadata>> {
  if (platformVariantIds.length === 0) {
    return new Map();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Map();
  }

  const { data } = await supabase
    .from("tiktok_video_metadata")
    .select("*")
    .eq("owner_id", user.id)
    .in("platform_variant_id", platformVariantIds);

  return new Map(
    ((data ?? []) as TikTokVideoMetadata[]).map((row) => [
      row.platform_variant_id,
      row,
    ]),
  );
}

/** The same read for the worker, which has no session to filter by. */
export async function loadTikTokMetadataAsWorker(
  client: SupabaseClient,
  platformVariantId: string,
  ownerId: string,
): Promise<TikTokVideoMetadata | null> {
  const { data } = await client
    .from("tiktok_video_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (data as TikTokVideoMetadata | null) ?? null;
}

// ---------------------------------------------------------------------------
// Publish sessions (worker credential only)
// ---------------------------------------------------------------------------

/** The columns safe to read back. `encrypted_upload_url` is never among them. */
const SESSION_COLUMNS =
  "id, owner_id, scheduled_post_id, idempotency_key, publish_id, delivery_mode, video_size_bytes, chunk_size_bytes, total_chunk_count, chunks_sent, status, external_post_id, last_error_code, created_at, updated_at";

/**
 * The session for this operation, if one was already opened.
 *
 * Keyed by the idempotency key, so a retry of the *same* approved operation
 * finds its session and a different operation correctly opens its own. This is
 * the double-publish guard: without it, the only safe behaviour after a crashed
 * upload would be never to retry.
 */
export async function findSession(
  client: SupabaseClient,
  idempotencyKey: string,
): Promise<PublishSessionRecord | null> {
  const { data } = await client
    .from("tiktok_publish_sessions")
    .select(SESSION_COLUMNS)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return (data as PublishSessionRecord | null) ?? null;
}

export interface RecordSessionInput {
  ownerId: string;
  scheduledPostId: string;
  idempotencyKey: string;
  publishId: string;
  deliveryMode: "direct_post" | "inbox";
  uploadUrl: string;
  videoSizeBytes: number;
  chunkSizeBytes: number;
  totalChunkCount: number;
}

/**
 * Record a newly initialised session.
 *
 * Written **before a single byte is sent**. TikTok has already allocated a
 * `publish_id` by this point, and a worker that died with that id unrecorded
 * would leave a retry no way to ask what happened — it would initialise a
 * second upload and, for a direct post, produce a second post.
 *
 * Returns `null` if the row could not be written, and the caller must treat
 * that as a reason not to upload rather than as a detail to log.
 */
export async function recordSession(
  client: SupabaseClient,
  input: RecordSessionInput,
): Promise<string | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data, error } = await client
    .from("tiktok_publish_sessions")
    .insert({
      owner_id: input.ownerId,
      scheduled_post_id: input.scheduledPostId,
      idempotency_key: input.idempotencyKey,
      publish_id: input.publishId,
      delivery_mode: input.deliveryMode,
      encrypted_upload_url: store.seal(input.uploadUrl),
      video_size_bytes: input.videoSizeBytes,
      chunk_size_bytes: input.chunkSizeBytes,
      total_chunk_count: input.totalChunkCount,
      status: "initialised",
    })
    .select("id")
    .single();

  return error || !data ? null : (data as { id: string }).id;
}

/**
 * Open a stored upload URL.
 *
 * The one function that returns this value, and it exists so a resumed upload
 * can continue into the session TikTok already holds. The caller sends it
 * straight to TikTok and keeps nothing.
 */
export async function openUploadUrl(
  client: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data } = await client
    .from("tiktok_publish_sessions")
    .select("encrypted_upload_url")
    .eq("id", sessionId)
    .maybeSingle();

  const sealed = (data as { encrypted_upload_url: string | null } | null)
    ?.encrypted_upload_url;

  if (!sealed) {
    return null;
  }

  try {
    return store.open(sealed);
  } catch {
    return null;
  }
}

export async function updateSessionStatus(
  client: SupabaseClient,
  sessionId: string,
  status: PublishStatus,
  errorCode?: string | null,
): Promise<void> {
  await client
    .from("tiktok_publish_sessions")
    .update({ status, last_error_code: errorCode ?? null })
    .eq("id", sessionId);
}

export async function recordChunksSent(
  client: SupabaseClient,
  sessionId: string,
  chunksSent: number,
): Promise<void> {
  await client
    .from("tiktok_publish_sessions")
    .update({ status: "uploading", chunks_sent: chunksSent })
    .eq("id", sessionId);
}

/**
 * Record a genuine publication.
 *
 * Only ever called with TikTok's own post id, and only for a direct post. The
 * database enforces both: `published` without an `external_post_id` is refused,
 * and an `inbox` session can never reach `published` at all.
 *
 * The upload URL is dropped at the same moment. The capability has been spent,
 * and keeping it would be keeping a live credential for no reason.
 */
export async function recordPublished(
  client: SupabaseClient,
  sessionId: string,
  externalPostId: string,
): Promise<void> {
  await client
    .from("tiktok_publish_sessions")
    .update({
      status: "published",
      external_post_id: externalPostId,
      encrypted_upload_url: null,
    })
    .eq("id", sessionId);
}

/**
 * Record that a video reached the creator's drafts.
 *
 * Deliberately a different function from `recordPublished`, writing a different
 * status, and carrying no post id — because a draft is not a post. Collapsing
 * the two would be the single easiest way for this system to claim something
 * went live that nobody has seen.
 */
export async function recordUploadedToDraft(
  client: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await client
    .from("tiktok_publish_sessions")
    .update({ status: "uploaded_to_draft", encrypted_upload_url: null })
    .eq("id", sessionId);
}

/** Sessions for one scheduled post, newest first. For the queue detail view. */
export async function sessionsForPost(
  client: SupabaseClient,
  scheduledPostId: string,
): Promise<PublishSessionRecord[]> {
  const { data } = await client
    .from("tiktok_publish_sessions")
    .select(SESSION_COLUMNS)
    .eq("scheduled_post_id", scheduledPostId)
    .order("created_at", { ascending: false });

  return (data ?? []) as PublishSessionRecord[];
}

/** The delivery mode saved for a variant, without loading everything else. */
export async function deliveryModeFor(
  client: SupabaseClient,
  platformVariantId: string,
  ownerId: string,
): Promise<DeliveryMode | null> {
  const metadata = await loadTikTokMetadataAsWorker(
    client,
    platformVariantId,
    ownerId,
  );
  return metadata?.delivery_mode ?? null;
}
