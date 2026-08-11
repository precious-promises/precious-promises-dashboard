"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearConnection,
  takeRefreshTokenForRevocation,
} from "@/lib/accounts/credentials";
import {
  createOAuthState,
  pruneExpiredStates,
} from "@/lib/accounts/oauth-states";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";
import { buildAuthorizationUrl, revokeToken } from "@/lib/youtube/oauth";
import { resolveYouTubeConfig } from "@/lib/youtube/server-config";

/**
 * Connecting and disconnecting external accounts.
 *
 * Both paths need the trusted worker credential, and for the same reason: the
 * tables that hold OAuth state and encrypted tokens have RLS enabled with **no
 * policies at all**, so the owner's own session is refused by the database. A
 * connection is something trusted server code does on the owner's behalf after
 * checking it is really them; it is not something a browser can write.
 */

const ACCOUNTS_PATH = "/dashboard/accounts";

function back(notice: string): never {
  revalidatePath(ACCOUNTS_PATH);
  redirect(`${ACCOUNTS_PATH}?notice=${notice}`);
}

/**
 * Start the YouTube connection.
 *
 * Issues a single-use state token, stores it against the owner, and redirects
 * to Google. The redirect is the last thing that happens: if the state cannot
 * be stored, the flow stops here rather than sending the owner to a consent
 * screen whose callback would then be refused.
 */
export async function connectYouTube(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { config } = resolveYouTubeConfig();
  if (config === null) {
    back("not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    back("no-worker-credential");
  }

  await pruneExpiredStates(client);
  const state = await createOAuthState(client, user.id, "youtube");

  if (state === null) {
    back("state-failed");
  }

  redirect(buildAuthorizationUrl(config, state));
}

/**
 * Disconnect a YouTube account.
 *
 * Revokes at Google **first**, then clears locally. Doing it the other way
 * round would leave a live grant on Dave's Google account that this interface
 * could no longer see or withdraw — a permission nobody can find is worse than
 * one that is visibly still there.
 *
 * The local clear happens either way. If Google did not confirm, the notice
 * says so plainly rather than reporting a clean disconnect.
 */
export async function disconnectYouTube(formData: FormData): Promise<void> {
  const accountId = formData.get("account_id");
  if (typeof accountId !== "string" || accountId === "") {
    back("unknown-account");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { client } = createWorkerClient();
  if (client === null) {
    back("no-worker-credential");
  }

  // Ownership is checked against the owner's own session before the worker
  // credential — which bypasses RLS — is used to touch anything.
  const { data: owned } = await supabase
    .from("social_accounts")
    .select("id, channel_title")
    .eq("id", accountId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!owned) {
    back("unknown-account");
  }

  const token = await takeRefreshTokenForRevocation(client, accountId, user.id);

  const revoked = token === null ? false : await revokeToken(token);

  await clearConnection(client, accountId, user.id);

  await recordAudit("youtube_disconnected", "social_account", accountId, {
    revoked_at_google: revoked,
  });

  revalidatePath("/dashboard/publish");
  back(revoked ? "disconnected" : "disconnected-not-revoked");
}
