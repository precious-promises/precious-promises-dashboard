import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { PlatformVariant } from "./types";

/**
 * Platform variant data access.
 *
 * Runs with the caller's session; RLS applies to every query. Ownership comes
 * from the session and is never accepted as an argument.
 */

async function requireUserId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("No authenticated user.");
  }
  return user.id;
}

export async function listVariantsForItem(
  contentItemId: string,
): Promise<PlatformVariant[]> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", ownerId)
    .order("platform", { ascending: true });

  if (error) {
    throw new Error(`Could not load platform variants: ${error.message}`);
  }
  return (data ?? []) as PlatformVariant[];
}

/** Variants for several items at once, keyed by content item id. */
export async function variantsByItem(
  contentItemIds: string[],
): Promise<Map<string, PlatformVariant[]>> {
  const result = new Map<string, PlatformVariant[]>();
  if (contentItemIds.length === 0) {
    return result;
  }

  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("owner_id", ownerId)
    .in("content_item_id", contentItemIds);

  if (error) {
    return result;
  }

  for (const variant of (data ?? []) as PlatformVariant[]) {
    const existing = result.get(variant.content_item_id) ?? [];
    existing.push(variant);
    result.set(variant.content_item_id, existing);
  }
  return result;
}

export async function getVariant(id: string): Promise<PlatformVariant | null> {
  const supabase = await createSupabaseServerClient();
  const ownerId = await requireUserId();

  const { data, error } = await supabase
    .from("platform_variants")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as PlatformVariant | null) ?? null;
}
