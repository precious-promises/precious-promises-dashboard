import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VariantPlatform } from "@/lib/variants/types";

import type { SocialAccount } from "./types";

/**
 * Connected-account reads for the interface.
 *
 * Uses the caller's own session, so RLS applies and these are the owner's rows
 * or nothing. Note what is missing: there is no function here that reads a
 * credential, and there could not be — `social_account_credentials` has RLS
 * enabled with no policies, so this client is refused by the database itself.
 *
 * That is the point of the split. A page that wanted a token would have to be
 * rewritten to use the worker credential, deliberately, in a file that is
 * covered by the client/server boundary test.
 */

export async function loadSocialAccounts(): Promise<SocialAccount[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("owner_id", user.id)
    .order("platform", { ascending: true });

  return (data ?? []) as SocialAccount[];
}

/** The account for one platform, or `null` when none is connected. */
export async function loadAccountForPlatform(
  platform: VariantPlatform,
): Promise<SocialAccount | null> {
  const accounts = await loadSocialAccounts();

  return (
    accounts.find(
      (account) =>
        account.platform === platform && account.status !== "disconnected",
    ) ?? null
  );
}
