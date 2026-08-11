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
import { DRIVE_SCOPES } from "@/lib/drive/config";
import { buildInstagramAuthorizationUrl } from "@/lib/instagram/oauth";
import { resolveInstagramConfig } from "@/lib/instagram/server-config";
import { resolveDriveConfig } from "@/lib/drive/server-config";
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

/**
 * Start the Google Drive connection.
 *
 * A separate grant from YouTube, deliberately. They share one OAuth client and
 * one redirect URI, but asking for both scopes at once would mean connecting a
 * channel also handed over the media library — and disconnecting the channel
 * would take the library with it.
 */
export async function connectGoogleDrive(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { config } = resolveDriveConfig();
  if (config === null) {
    back("drive-not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    back("no-worker-credential");
  }

  await pruneExpiredStates(client);
  const state = await createOAuthState(client, user.id, "google_drive");

  if (state === null) {
    back("state-failed");
  }

  redirect(buildAuthorizationUrl(config, state, DRIVE_SCOPES));
}

/**
 * Disconnect Google Drive.
 *
 * Revokes at Google first, then clears locally — the same order as YouTube,
 * for the same reason: a live grant nobody can see is worse than one that is
 * visibly still there.
 *
 * **Imported media assets are left alone.** They are records of files that
 * still exist in Dave's Drive; deleting them because this application lost its
 * key would destroy the library's index over a credential problem. They simply
 * stop resolving until Drive is reconnected.
 */
export async function disconnectGoogleDrive(formData: FormData): Promise<void> {
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

  const { data: owned } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("owner_id", user.id)
    .eq("platform", "google_drive")
    .maybeSingle();

  if (!owned) {
    back("unknown-account");
  }

  const token = await takeRefreshTokenForRevocation(client, accountId, user.id);
  const revoked = token === null ? false : await revokeToken(token);

  await clearConnection(client, accountId, user.id);

  await recordAudit("drive_disconnected", "social_account", accountId, {
    revoked_at_google: revoked,
  });

  revalidatePath("/dashboard/drive");
  revalidatePath("/dashboard/media");
  back(revoked ? "drive-disconnected" : "drive-disconnected-not-revoked");
}

/**
 * Start the Instagram connection.
 *
 * Meta rather than Google, so a different authorisation URL and a different
 * callback — but the same single-use state, stored against the owner before
 * the redirect happens.
 */
export async function connectInstagram(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { config } = resolveInstagramConfig();
  if (config === null) {
    back("ig-not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    back("no-worker-credential");
  }

  await pruneExpiredStates(client);
  const state = await createOAuthState(client, user.id, "instagram");

  if (state === null) {
    back("state-failed");
  }

  redirect(buildInstagramAuthorizationUrl(config, state));
}

/**
 * Disconnect Instagram.
 *
 * Meta issues no refresh token, so there is nothing to revoke through a
 * revocation endpoint the way Google offers one — the long-lived token simply
 * stops being used and expires. The stored credential is deleted immediately,
 * and the notice says plainly that removing the app's access at Meta is a
 * separate step the owner may want to take.
 *
 * **Published posts are never touched.** Disconnecting is about this
 * application's access, not about content that already reached an audience.
 */
export async function disconnectInstagram(formData: FormData): Promise<void> {
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

  const { data: owned } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("owner_id", user.id)
    .eq("platform", "instagram")
    .maybeSingle();

  if (!owned) {
    back("unknown-account");
  }

  await clearConnection(client, accountId, user.id);

  await recordAudit("instagram_disconnected", "social_account", accountId, {});

  revalidatePath("/dashboard/publish");
  back("ig-disconnected");
}
