import { NextResponse, type NextRequest } from "next/server";

import { saveConnection } from "@/lib/accounts/credentials";
import { consumeOAuthState } from "@/lib/accounts/oauth-states";
import { createWorkerClient } from "@/lib/supabase/worker";
import { fetchCreatorInfo, fetchUser } from "@/lib/tiktok/api";
import {
  canDirectPost,
  canUploadToDrafts,
  exchangeTikTokCode,
} from "@/lib/tiktok/oauth";
import { resolveTikTokConfig } from "@/lib/tiktok/server-config";

/**
 * TikTok's OAuth redirect target.
 *
 * The same order as the Google and Meta callbacks, for the same reasons:
 *
 * 1. **Consume the state first**, before the code is exchanged. That is what
 *    stops a crafted callback URL attaching somebody else's TikTok account to
 *    Dave's, and what stops the same callback being replayed.
 * 2. Exchange server-side. The client secret never touches a browser.
 * 3. **Identify the account before recording anything.** A token proves
 *    somebody authorised something; `user/info` proves which account. A
 *    connection is never recorded from a manually supplied id, and never from
 *    the token alone.
 *
 * TikTok-specific: the consent screen lets scopes be declined individually, so
 * what came back is checked rather than assumed. A connection with neither
 * upload nor publish permission cannot do anything and is refused outright; one
 * with upload but not publish is a **real, working draft connection** and is
 * recorded as such, because that is genuinely what TikTok granted.
 *
 * Nothing TikTok returned is echoed into the redirect. Callback URLs end up in
 * browser history and referrer headers.
 */

const ACCOUNTS_PATH = "/dashboard/accounts";

function back(request: NextRequest, notice: string): NextResponse {
  return NextResponse.redirect(
    new URL(`${ACCOUNTS_PATH}?notice=${notice}`, request.url),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  const oauthError = params.get("error");
  if (oauthError !== null) {
    return back(
      request,
      oauthError === "access_denied" ? "tt-declined" : "tt-refused",
    );
  }

  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) {
    return back(request, "tt-invalid-callback");
  }

  const { config } = resolveTikTokConfig();
  if (config === null) {
    return back(request, "tt-not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return back(request, "no-worker-credential");
  }

  const consumed = await consumeOAuthState(client, state);
  if (!consumed.ok || consumed.platform !== "tiktok") {
    return back(request, "state-refused");
  }

  let tokens;
  try {
    tokens = await exchangeTikTokCode(config, code);
  } catch {
    return back(request, "tt-exchange-failed");
  }

  // Neither permission means nothing can be sent to TikTok at all. Recording
  // this would produce an account that looks connected and refuses everything.
  if (
    !canUploadToDrafts(tokens.grantedScopes) &&
    !canDirectPost(tokens.grantedScopes)
  ) {
    return back(request, "tt-scope-refused");
  }

  let user;
  try {
    user = await fetchUser({ accessToken: tokens.accessToken });
  } catch {
    return back(request, "tt-account-lookup-failed");
  }

  if (user === null) {
    return back(request, "tt-no-account");
  }

  // The username is what makes a post URL possible later, and it comes from
  // `creator_info` rather than `user/info` — `user.info.basic` does not carry
  // it. Its absence is not fatal: the connection is real either way, and a
  // missing handle means `postUrl` returns null rather than guessing a link.
  let handle: string | null = null;
  try {
    const creator = await fetchCreatorInfo({ accessToken: tokens.accessToken });
    handle = creator.username === "" ? null : `@${creator.username}`;
  } catch {
    handle = null;
  }

  const saved = await saveConnection(client, {
    ownerId: consumed.ownerId,
    platform: "tiktok",
    providerAccountId: user.openId,
    displayName: user.displayName,
    handle,
    // TikTok has no channel. Leaving these null rather than repurposing them
    // keeps "which YouTube channel" a question only YouTube rows answer.
    channelId: null,
    channelTitle: null,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      grantedScopes: tokens.grantedScopes,
    },
  });

  if (!saved.ok) {
    return back(request, "tt-save-failed");
  }

  return back(
    request,
    canDirectPost(tokens.grantedScopes)
      ? "tt-connected"
      : "tt-connected-drafts",
  );
}
