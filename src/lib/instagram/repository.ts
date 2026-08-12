import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { InstagramMediaType } from "./config";
import type {
  ContainerRecord,
  ContainerStatus,
  InstagramMediaMetadata,
} from "./types";

/**
 * Instagram record access.
 *
 * The same split as YouTube's: settings belong to the owner and are read
 * through their own session, while containers are worker state in a table with
 * RLS enabled and **no policies**, reachable only by trusted server code.
 *
 * A container id is not a secret, but it is not the browser's business either:
 * it is the value a retry uses to decide whether a post already exists, and a
 * browser that could write one could manufacture that decision.
 */

// ---------------------------------------------------------------------------
// Settings (session credential, RLS applies)
// ---------------------------------------------------------------------------

export async function loadInstagramMetadata(
  platformVariantId: string,
): Promise<InstagramMediaMetadata | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("instagram_media_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", user.id)
    .maybeSingle();

  return (data as InstagramMediaMetadata | null) ?? null;
}

export async function loadInstagramMetadataFor(
  platformVariantIds: string[],
): Promise<Map<string, InstagramMediaMetadata>> {
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
    .from("instagram_media_metadata")
    .select("*")
    .eq("owner_id", user.id)
    .in("platform_variant_id", platformVariantIds);

  return new Map(
    ((data ?? []) as InstagramMediaMetadata[]).map((row) => [
      row.platform_variant_id,
      row,
    ]),
  );
}

/** The same read for the worker, which has no session to filter by. */
export async function loadInstagramMetadataAsWorker(
  client: SupabaseClient,
  platformVariantId: string,
  ownerId: string,
): Promise<InstagramMediaMetadata | null> {
  const { data } = await client
    .from("instagram_media_metadata")
    .select("*")
    .eq("platform_variant_id", platformVariantId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (data as InstagramMediaMetadata | null) ?? null;
}

// ---------------------------------------------------------------------------
// Containers (worker credential only)
// ---------------------------------------------------------------------------

/**
 * The container for this operation, if one was already created.
 *
 * Keyed by the idempotency key, so a retry of the *same* approved operation
 * finds its container and a different operation correctly creates its own.
 */
export async function findContainer(
  client: SupabaseClient,
  idempotencyKey: string,
): Promise<ContainerRecord | null> {
  const { data } = await client
    .from("instagram_publish_containers")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  return (data as ContainerRecord | null) ?? null;
}

/**
 * Record a newly created container.
 *
 * Written **before** the publish call. If the worker dies between creating and
 * publishing, this row is what lets the next attempt ask Meta about the
 * container rather than creating a second one and posting twice.
 */
export async function recordContainer(
  client: SupabaseClient,
  input: {
    ownerId: string;
    scheduledPostId: string;
    idempotencyKey: string;
    containerId: string;
    mediaType: InstagramMediaType;
  },
): Promise<string | null> {
  const { data, error } = await client
    .from("instagram_publish_containers")
    .insert({
      owner_id: input.ownerId,
      scheduled_post_id: input.scheduledPostId,
      idempotency_key: input.idempotencyKey,
      container_id: input.containerId,
      media_type: input.mediaType,
      status: "in_progress",
    })
    .select("id")
    .single();

  return error || !data ? null : (data as { id: string }).id;
}

export async function updateContainerStatus(
  client: SupabaseClient,
  id: string,
  status: ContainerStatus,
  errorCode?: string | null,
): Promise<void> {
  await client
    .from("instagram_publish_containers")
    .update({ status, last_error_code: errorCode ?? null })
    .eq("id", id);
}

/**
 * Record a genuine publication.
 *
 * The media id is written the moment Meta returns it, before the permalink is
 * fetched or anything else is attempted. A post that exists must be recorded
 * as existing even if every step after it fails.
 */
export async function recordPublished(
  client: SupabaseClient,
  id: string,
  publishedMediaId: string,
): Promise<void> {
  await client
    .from("instagram_publish_containers")
    .update({ status: "published", published_media_id: publishedMediaId })
    .eq("id", id);
}
