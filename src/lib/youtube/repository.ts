import type { SupabaseClient } from "@supabase/supabase-js";

import { getSecretStore } from "@/lib/crypto/secrets";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { UploadSessionRecord, YouTubeVideoMetadata } from "./types";

/**
 * YouTube record access.
 *
 * Two audiences with different credentials, kept apart on purpose:
 *
 * - **The interface** reads `youtube_video_metadata` through the owner's own
 *   session, so RLS applies. Metadata is ordinary content — a category, some
 *   tags, a privacy choice — and belongs to the owner.
 * - **The worker** reads and writes `youtube_upload_sessions` through the
 *   trusted server credential, because that table has RLS enabled with no
 *   policies and no session can touch it. It holds an encrypted resumable
 *   session URI, which is a bearer capability.
 *
 * The session URI is decrypted in exactly one function below, at the moment it
 * is handed to the upload call. It is never returned to the interface, never
 * put on `UploadSessionRecord`, and never written to an audit record.
 */

// ---------------------------------------------------------------------------
// Metadata (session credential, RLS applies)
// ---------------------------------------------------------------------------

/** The saved YouTube settings for one variant, as the owner sees them. */
export async function loadYouTubeMetadata(
  platformVariantId: string,
): Promise<YouTubeVideoMetadata | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("youtube_video_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return (data as YouTubeVideoMetadata | null) ?? null;
}

/** Saved settings for several variants at once, keyed by variant id. */
export async function loadYouTubeMetadataFor(
  platformVariantIds: string[],
): Promise<Map<string, YouTubeVideoMetadata>> {
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
    .from("youtube_video_metadata")
    .select("*")
    .eq("owner_id", user.id)
    .in("platform_variant_id", platformVariantIds);

  return new Map(
    ((data ?? []) as YouTubeVideoMetadata[]).map((row) => [
      row.platform_variant_id,
      row,
    ]),
  );
}

/** The same read, for the worker, which has no session to filter by. */
export async function loadMetadataAsWorker(
  client: SupabaseClient,
  platformVariantId: string,
  ownerId: string,
): Promise<YouTubeVideoMetadata | null> {
  const { data } = await client
    .from("youtube_video_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (data as YouTubeVideoMetadata | null) ?? null;
}

// ---------------------------------------------------------------------------
// Upload sessions (worker credential only)
// ---------------------------------------------------------------------------

/**
 * Find the upload session for an operation, if one was already opened.
 *
 * Keyed by the idempotency key, which binds the schedule, the platform and the
 * approval. A retry of the *same* approved operation finds its session; a
 * different operation — including the same content re-approved after an edit —
 * does not, and correctly starts a new upload.
 */
export async function findUploadSession(
  client: SupabaseClient,
  idempotencyKey: string,
): Promise<UploadSessionRecord | null> {
  const { data } = await client
    .from("youtube_upload_sessions")
    .select(
      "id, owner_id, scheduled_post_id, idempotency_key, bytes_total, bytes_sent, video_id, status, created_at, updated_at",
    )
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return (data as UploadSessionRecord | null) ?? null;
}

/**
 * Decrypt an open session's URI, for the moment of use only.
 *
 * The one place the URI becomes plaintext. Callers use it immediately and hold
 * nothing; the value is never returned upwards past the upload call.
 */
export async function openSessionUri(
  client: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data } = await client
    .from("youtube_upload_sessions")
    .select("encrypted_session_uri")
    .eq("id", sessionId)
    .maybeSingle();

  const encrypted = (data as { encrypted_session_uri: string } | null)
    ?.encrypted_session_uri;

  if (!encrypted) {
    return null;
  }

  try {
    return store.open(encrypted);
  } catch {
    // An unreadable URI means the session cannot be resumed. That is a reason
    // to abandon it and ask YouTube, not to guess.
    return null;
  }
}

/**
 * Record a newly opened resumable session.
 *
 * Written **before** any bytes are sent. That order is the whole point: if the
 * worker dies mid-upload, the session that survives is what lets the next
 * attempt ask YouTube what happened instead of uploading a second copy.
 */
export async function recordUploadSession(
  client: SupabaseClient,
  input: {
    ownerId: string;
    scheduledPostId: string;
    idempotencyKey: string;
    sessionUri: string;
    bytesTotal: number;
  },
): Promise<string | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data, error } = await client
    .from("youtube_upload_sessions")
    .insert({
      owner_id: input.ownerId,
      scheduled_post_id: input.scheduledPostId,
      idempotency_key: input.idempotencyKey,
      encrypted_session_uri: store.seal(input.sessionUri),
      bytes_total: input.bytesTotal,
      status: "open",
    })
    .select("id")
    .single();

  return error || !data ? null : (data as { id: string }).id;
}

/**
 * Mark a session complete with the video id YouTube returned.
 *
 * The id is written the moment it is known, before thumbnails, playlists or
 * anything else that could fail. A video that exists must be recorded as
 * existing even if every step after it goes wrong.
 */
export async function completeUploadSession(
  client: SupabaseClient,
  sessionId: string,
  videoId: string,
): Promise<void> {
  await client
    .from("youtube_upload_sessions")
    .update({ status: "completed", video_id: videoId })
    .eq("id", sessionId);
}

/** Give up on a session whose URI YouTube no longer recognises. */
export async function abandonUploadSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await client
    .from("youtube_upload_sessions")
    .update({ status: "abandoned" })
    .eq("id", sessionId);
}

/** Record how far an interrupted upload actually got. */
export async function recordBytesSent(
  client: SupabaseClient,
  sessionId: string,
  bytesSent: number,
): Promise<void> {
  await client
    .from("youtube_upload_sessions")
    .update({ bytes_sent: bytesSent })
    .eq("id", sessionId);
}
