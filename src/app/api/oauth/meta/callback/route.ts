import { NextResponse, type NextRequest } from "next/server";

import { saveLongLivedConnection } from "@/lib/accounts/credentials";
import { consumeOAuthState } from "@/lib/accounts/oauth-states";
import { fetchAccount } from "@/lib/instagram/api";
import {
  canPublish,
  exchangeForLongLivedToken,
  exchangeInstagramCode,
} from "@/lib/instagram/oauth";
import { resolveInstagramConfig } from "@/lib/instagram/server-config";
import { createWorkerClient } from "@/lib/supabase/worker";

/**
 * Meta's OAuth redirect target.
 *
 * Separate from the Google callback because the providers differ in more than
 * hostnames: Meta needs a second exchange to turn a short-lived token into a
 * long-lived one, and issues no refresh token at all.
 *
 * The order is the same as Google's, and for the same reasons:
 *
 * 1. **Consume the state first**, before the code is exchanged. That is what
 *    stops a crafted callback URL attaching somebody else's account, and what
 *    stops the same callback being replayed.
 * 2. Exchange server-side. The app secret never touches a browser.
 * 3. **Exchange again for a long-lived token.** Skipping this would store a
 *    credential that dies within the hour — a connection that looks fine and
 *    then fails for no visible reason.
 * 4. **Identify the account before recording anything.** A token proves
 *    somebody authorised something; this proves which account.
 *
 * Nothing Meta returned is echoed into the redirect. Callback URLs end up in
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
      oauthError === "access_denied" ? "ig-declined" : "ig-refused",
    );
  }

  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) {
    return back(request, "ig-invalid-callback");
  }

  const { config } = resolveInstagramConfig();
  if (config === null) {
    return back(request, "ig-not-configured");
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return back(request, "no-worker-credential");
  }

  const consumed = await consumeOAuthState(client, state);
  if (!consumed.ok || consumed.platform !== "instagram") {
    return back(request, "state-refused");
  }

  // Step 2 — the short-lived token.
  let shortLived;
  try {
    shortLived = await exchangeInstagramCode(config, code);
  } catch {
    return back(request, "ig-exchange-failed");
  }

  if (!canPublish(shortLived.permissions)) {
    // Meta's consent screen lets permissions be declined individually. A
    // connection that cannot publish is not a working connection.
    return back(request, "ig-scope-refused");
  }

  // Step 3 — the long-lived token. Without this the connection dies in an hour.
  let tokens;
  try {
    tokens = await exchangeForLongLivedToken(
      config,
      shortLived.accessToken,
      shortLived.permissions,
    );
  } catch {
    return back(request, "ig-long-lived-failed");
  }

  // Step 4 — which account is this?
  let account;
  try {
    account = await fetchAccount({ accessToken: tokens.accessToken });
  } catch {
    return back(request, "ig-account-lookup-failed");
  }

  if (account === null) {
    return back(request, "ig-no-account");
  }

  const saved = await saveLongLivedConnection(client, {
    ownerId: consumed.ownerId,
    platform: "instagram",
    providerAccountId: account.id,
    displayName: account.username || null,
    handle: account.username ? `@${account.username}` : null,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
    grantedScopes: tokens.grantedScopes,
  });

  if (!saved.ok) {
    return back(request, "save-failed");
  }

  return back(request, "ig-connected");
}
