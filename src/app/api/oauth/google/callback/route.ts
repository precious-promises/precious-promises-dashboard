import { NextResponse, type NextRequest } from "next/server";

import { saveConnection } from "@/lib/accounts/credentials";
import { consumeOAuthState } from "@/lib/accounts/oauth-states";
import { createWorkerClient } from "@/lib/supabase/worker";
import { fetchMyChannel } from "@/lib/youtube/api";
import { getFile } from "@/lib/drive/api";
import {
  DRIVE_ROOT_NAME,
  DRIVE_SCOPE,
  FOLDER_MIME_TYPE,
} from "@/lib/drive/config";
import { resolveDriveConfig } from "@/lib/drive/server-config";
import { YOUTUBE_ANALYTICS_SCOPE } from "@/lib/youtube/config";
import { canUpload, exchangeCode, type TokenSet } from "@/lib/youtube/oauth";
import { resolveYouTubeConfig } from "@/lib/youtube/server-config";

/**
 * Google's OAuth redirect target.
 *
 * The URL registered in Google Cloud Console must be exactly
 * `<APP_URL>/api/oauth/google/callback` — Google matches it character for
 * character, and a trailing slash is a different URI.
 *
 * The order of operations here is the security of the whole flow:
 *
 * 1. **Consume the state first.** Before the code is exchanged, before
 *    anything is looked up. A callback with a state that is missing, expired
 *    or already used is refused outright — that is what stops a crafted
 *    callback URL attaching somebody else's channel to Dave's account, and
 *    what stops the same callback being replayed.
 * 2. **Exchange the code server-side.** The client secret never touches a
 *    browser.
 * 3. **Look up the channel before recording anything.** A token proves
 *    somebody authorised something; the channel lookup proves *what*. A
 *    connection recorded from the token alone would be a connection to an
 *    unknown channel.
 * 4. **Then store**, with both tokens encrypted.
 *
 * Every failure redirects back to Connected Accounts with a short reason code.
 * Nothing about the error — not Google's description, not the code, not the
 * state — is echoed into the response, because this URL and its query string
 * end up in browser history and referrer headers.
 */

const ACCOUNTS_PATH = "/dashboard/accounts";

function back(request: NextRequest, notice: string): NextResponse {
  return NextResponse.redirect(
    new URL(`${ACCOUNTS_PATH}?notice=${notice}`, request.url),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  // Google reports a declined consent here rather than as an HTTP error.
  const oauthError = params.get("error");
  if (oauthError !== null) {
    return back(
      request,
      oauthError === "access_denied" ? "declined" : "google-refused",
    );
  }

  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) {
    return back(request, "invalid-callback");
  }

  const { config } = resolveYouTubeConfig();
  if (config === null) {
    return back(request, "not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return back(request, "no-worker-credential");
  }

  // 1. State, consumed before anything else happens. It also tells us which
  //    connection this callback is for — YouTube and Drive share one OAuth
  //    client and one redirect URI, but are separate grants.
  const consumed = await consumeOAuthState(client, state);
  if (!consumed.ok) {
    return back(request, "state-refused");
  }

  // 2. The exchange.
  let tokens;
  try {
    tokens = await exchangeCode(config, code);
  } catch {
    return back(request, "exchange-failed");
  }

  if (consumed.platform === "google_drive") {
    return completeDriveConnection(request, client, consumed.ownerId, tokens);
  }

  if (!canUpload(tokens.grantedScopes)) {
    // Google's consent screen lets scopes be unticked. A connection that
    // cannot upload is not a working connection, and recording it as one
    // would mean every future publish failing for a reason nobody could see.
    return back(request, "scope-refused");
  }

  // 3. Which channel is this? Asked before anything is written.
  let channel;
  try {
    channel = await fetchMyChannel({ accessToken: tokens.accessToken });
  } catch {
    return back(request, "channel-lookup-failed");
  }

  if (channel === null) {
    // A Google account is not a YouTube channel. Connecting one as though it
    // were would produce an account that can never upload.
    return back(request, "no-channel");
  }

  // 4. Store it.
  const saved = await saveConnection(client, {
    ownerId: consumed.ownerId,
    platform: "youtube",
    providerAccountId: channel.id,
    displayName: channel.title || null,
    handle: channel.customUrl,
    channelId: channel.id,
    channelTitle: channel.title || null,
    tokens,
  });

  if (!saved.ok) {
    return back(
      request,
      tokens.refreshToken === null ? "no-refresh-token" : "save-failed",
    );
  }

  // Whether the analytics permission came back is read from what Google
  // actually granted, never from what was asked for. A consent screen lets
  // individual scopes be unticked, so intent is not evidence.
  return back(
    request,
    tokens.grantedScopes.includes(YOUTUBE_ANALYTICS_SCOPE)
      ? "analytics-granted"
      : "connected",
  );
}

/**
 * Finish a Drive connection.
 *
 * The equivalent of the channel lookup: a token proves somebody authorised
 * something, and **reading the approved root folder proves what**. A Drive
 * connection recorded without checking the root would present as working and
 * then refuse every file, for a reason nobody could see.
 */
async function completeDriveConnection(
  request: NextRequest,
  client: ReturnType<typeof createWorkerClient>["client"],
  ownerId: string,
  tokens: TokenSet,
): Promise<NextResponse> {
  if (client === null) {
    return back(request, "no-worker-credential");
  }

  const { rootFolderId } = resolveDriveConfig();
  if (rootFolderId === null) {
    return back(request, "drive-not-configured");
  }

  if (!tokens.grantedScopes.includes(DRIVE_SCOPE)) {
    return back(request, "drive-scope-refused");
  }

  let root;
  try {
    root = await getFile({ accessToken: tokens.accessToken }, rootFolderId);
  } catch {
    return back(request, "drive-root-unreadable");
  }

  if (root === null || root.mimeType !== FOLDER_MIME_TYPE || root.trashed) {
    return back(request, "drive-root-missing");
  }

  const saved = await saveConnection(client, {
    ownerId,
    platform: "google_drive",
    providerAccountId: rootFolderId,
    displayName: root.name || DRIVE_ROOT_NAME,
    handle: null,
    channelId: null,
    channelTitle: null,
    tokens,
  });

  if (!saved.ok) {
    return back(
      request,
      tokens.refreshToken === null ? "no-refresh-token" : "save-failed",
    );
  }

  return back(request, "drive-connected");
}
