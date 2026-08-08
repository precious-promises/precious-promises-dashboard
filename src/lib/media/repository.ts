import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { MediaAsset } from "./types";

/**
 * Media asset reads.
 *
 * Metadata only. Nothing here fetches, uploads or streams a file — a row
 * describes something stored elsewhere, and no storage provider is connected.
 */
export async function listMediaAssets(): Promise<MediaAsset[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as MediaAsset[];
}
