import type { SupabaseClient } from "@supabase/supabase-js";

import { getSecretStore } from "@/lib/crypto/secrets";
import {
  OAuthError,
  refreshAccessToken,
  type TokenSet,
} from "@/lib/youtube/oauth";
import { resolveYouTubeConfig } from "@/lib/youtube/server-config";

import {
  needsRefresh,
  type ConnectionPlatform,
  type SocialAccount,
} from "./types";

/**
 * Stored OAuth credentials.
 *
 * **Server-only, and reachable only through the worker credential.** The
 * `social_account_credentials` table has RLS enabled with no policies at all,
 * so a session-backed client is refused by the database no matter what it
 * asks for. That is not a convention this module upholds; it is a fact about
 * the table this module has to work around, which is the right way round.
 *
 * The rules every function here follows:
 *
 * - A token is decrypted at the point of use and held in a local variable.
 *   It is never returned to a caller that renders, never put on a type that
 *   crosses a boundary, and never written to a log or an audit record.
 * - A refresh that does not return a new refresh token leaves the stored one
 *   alone. Google only issues one on a fresh consent, and overwriting it with
 *   nothing would end the connection.
 * - `invalid_grant` means the grant is dead. The account moves to
 *   `needs_reconnect` rather than being retried, because a revoked grant will
 *   be refused every time.
 */

/** A decrypted access token, live only for the duration of one call. */
export interface LiveCredential {
  accessToken: string;
  grantedScopes: string[];
}

export type CredentialResult =
  | { ok: true; credential: LiveCredential }
  | { ok: false; reason: string; needsReconnect: boolean };

interface CredentialRow {
  id: string;
  social_account_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[];
}

/**
 * Get a usable access token for an account, refreshing it if needed.
 *
 * The refresh is written back before the token is returned, so a concurrent
 * worker picking up the same account gets the fresh one rather than repeating
 * the refresh — Google's refresh endpoint is not free, and a burst of them
 * looks like abuse.
 */
export async function getLiveCredential(
  client: SupabaseClient,
  account: SocialAccount,
  now: Date = new Date(),
  fetchImpl: typeof fetch = fetch,
): Promise<CredentialResult> {
  const store = getSecretStore();
  if (store === null) {
    return {
      ok: false,
      reason:
        "No token encryption key is configured, so stored credentials cannot be read.",
      needsReconnect: false,
    };
  }

  const { data } = await client
    .from("social_account_credentials")
    .select(
      "id, social_account_id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, granted_scopes",
    )
    .eq("social_account_id", account.id)
    .eq("owner_id", account.owner_id)
    .maybeSingle();

  const row = (data as CredentialRow | null) ?? null;

  if (row === null) {
    return {
      ok: false,
      reason: "No stored credentials for this account.",
      needsReconnect: true,
    };
  }

  // The still-valid path: decrypt and go.
  if (
    row.encrypted_access_token !== null &&
    !needsRefresh(row.access_token_expires_at, now)
  ) {
    try {
      return {
        ok: true,
        credential: {
          accessToken: store.open(row.encrypted_access_token),
          grantedScopes: row.granted_scopes ?? [],
        },
      };
    } catch {
      // A ciphertext that will not open is not recoverable by retrying. The
      // key has changed, or the row was tampered with; either way the owner
      // must reconnect.
      return {
        ok: false,
        reason:
          "The stored credential could not be decrypted. Reconnect the account.",
        needsReconnect: true,
      };
    }
  }

  if (row.encrypted_refresh_token === null) {
    return {
      ok: false,
      reason:
        "The access token has expired and there is no refresh token. Reconnect the account.",
      needsReconnect: true,
    };
  }

  const { config, problems } = resolveYouTubeConfig();
  if (config === null) {
    return { ok: false, reason: problems.join(" "), needsReconnect: false };
  }

  let refreshToken: string;
  try {
    refreshToken = store.open(row.encrypted_refresh_token);
  } catch {
    return {
      ok: false,
      reason:
        "The stored refresh token could not be decrypted. Reconnect the account.",
      needsReconnect: true,
    };
  }

  let tokens: TokenSet;
  try {
    tokens = await refreshAccessToken(config, refreshToken, fetchImpl, now);
  } catch (error) {
    const dead = error instanceof OAuthError && error.code === "invalid_grant";
    return {
      ok: false,
      reason:
        error instanceof OAuthError
          ? error.message
          : "The access token could not be refreshed.",
      needsReconnect: dead,
    };
  }

  await persistTokens(client, account, tokens, store, row.id);

  return {
    ok: true,
    credential: {
      accessToken: tokens.accessToken,
      grantedScopes:
        tokens.grantedScopes.length > 0
          ? tokens.grantedScopes
          : (row.granted_scopes ?? []),
    },
  };
}

/**
 * Write a token set back, encrypted.
 *
 * `encrypted_refresh_token` is only included when Google actually issued one.
 * Omitting the key from the update object — rather than setting it to `null` —
 * is what preserves the existing value.
 */
async function persistTokens(
  client: SupabaseClient,
  account: SocialAccount,
  tokens: TokenSet,
  store: NonNullable<ReturnType<typeof getSecretStore>>,
  credentialId: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    encrypted_access_token: store.seal(tokens.accessToken),
    access_token_expires_at: tokens.expiresAt.toISOString(),
  };

  if (tokens.refreshToken !== null) {
    update.encrypted_refresh_token = store.seal(tokens.refreshToken);
  }
  if (tokens.grantedScopes.length > 0) {
    update.granted_scopes = tokens.grantedScopes;
  }

  await client
    .from("social_account_credentials")
    .update(update)
    .eq("id", credentialId)
    .eq("owner_id", account.owner_id);

  await client
    .from("social_accounts")
    .update({ token_expires_at: tokens.expiresAt.toISOString() })
    .eq("id", account.id)
    .eq("owner_id", account.owner_id);
}

/**
 * Record that this account's authorisation is no longer accepted.
 *
 * Deliberately not a disconnect. The account, its channel and its history stay
 * — the owner needs to see *which* connection broke, and a row that vanished
 * would tell them nothing.
 */
export async function markNeedsReconnect(
  client: SupabaseClient,
  accountId: string,
  ownerId: string,
): Promise<void> {
  await client
    .from("social_accounts")
    .update({ status: "needs_reconnect" })
    .eq("id", accountId)
    .eq("owner_id", ownerId);
}

export interface ConnectionInput {
  ownerId: string;
  platform: ConnectionPlatform;
  providerAccountId: string;
  displayName: string | null;
  handle: string | null;
  channelId: string | null;
  channelTitle: string | null;
  tokens: TokenSet;
}

/**
 * Store a completed connection.
 *
 * Called only after a genuine token exchange **and** a successful channel
 * lookup. Both matter: a token proves someone authorised something, and the
 * channel lookup proves what. Writing `connected` from the token alone would
 * record a connection to an unknown channel — which is why the database also
 * refuses a connected YouTube row with no `channel_id`.
 *
 * Upserts on `(owner_id, platform, provider_account_id)`, so reconnecting the
 * same channel refreshes it rather than accumulating duplicates.
 */
export async function saveConnection(
  client: SupabaseClient,
  input: ConnectionInput,
  now: Date = new Date(),
): Promise<{ ok: true; accountId: string } | { ok: false; reason: string }> {
  const store = getSecretStore();
  if (store === null) {
    return {
      ok: false,
      reason:
        "No token encryption key is configured, so the credential cannot be stored.",
    };
  }

  if (input.tokens.refreshToken === null) {
    // Without a refresh token the connection dies at the first expiry, which
    // would be an hour of working publishing followed by silent failure.
    return {
      ok: false,
      reason:
        "Google did not return a refresh token. Remove this application's access in your Google Account security settings and connect again, so Google issues a fresh consent.",
    };
  }

  const { data: accountRow, error: accountError } = await client
    .from("social_accounts")
    .upsert(
      {
        owner_id: input.ownerId,
        platform: input.platform,
        provider_account_id: input.providerAccountId,
        display_name: input.displayName,
        handle: input.handle,
        channel_id: input.channelId,
        channel_title: input.channelTitle,
        status: "connected",
        granted_scopes: input.tokens.grantedScopes,
        connected_at: now.toISOString(),
        disconnected_at: null,
        token_expires_at: input.tokens.expiresAt.toISOString(),
      },
      { onConflict: "owner_id,platform,provider_account_id" },
    )
    .select("id")
    .single();

  if (accountError || !accountRow) {
    return { ok: false, reason: "The connection could not be saved." };
  }

  const accountId = (accountRow as { id: string }).id;

  const { error: credentialError } = await client
    .from("social_account_credentials")
    .upsert(
      {
        owner_id: input.ownerId,
        social_account_id: accountId,
        encrypted_access_token: store.seal(input.tokens.accessToken),
        encrypted_refresh_token: store.seal(input.tokens.refreshToken),
        access_token_expires_at: input.tokens.expiresAt.toISOString(),
        granted_scopes: input.tokens.grantedScopes,
      },
      { onConflict: "social_account_id" },
    );

  if (credentialError) {
    // An account row with no credential would present as connected and fail
    // every publish. Stand it back down rather than leave that.
    await client
      .from("social_accounts")
      .update({ status: "disconnected", disconnected_at: now.toISOString() })
      .eq("id", accountId)
      .eq("owner_id", input.ownerId);

    return { ok: false, reason: "The credential could not be stored." };
  }

  return { ok: true, accountId };
}

/**
 * Read the stored refresh token so it can be revoked at Google.
 *
 * The only function that hands a token to a caller, and it exists for exactly
 * one purpose: revocation needs the token itself. The caller sends it straight
 * to Google's revoke endpoint and holds nothing.
 */
export async function takeRefreshTokenForRevocation(
  client: SupabaseClient,
  accountId: string,
  ownerId: string,
): Promise<string | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data } = await client
    .from("social_account_credentials")
    .select("encrypted_refresh_token")
    .eq("social_account_id", accountId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  const encrypted = (data as { encrypted_refresh_token: string | null } | null)
    ?.encrypted_refresh_token;

  if (!encrypted) {
    return null;
  }

  try {
    return store.open(encrypted);
  } catch {
    return null;
  }
}

/**
 * Delete the stored credential and mark the account disconnected.
 *
 * The credential row goes entirely — a disconnected account has no business
 * keeping an encrypted token around. The account row stays so the owner can
 * see the channel was once connected, and so history that references it
 * survives.
 */
export async function clearConnection(
  client: SupabaseClient,
  accountId: string,
  ownerId: string,
  now: Date = new Date(),
): Promise<void> {
  await client
    .from("social_account_credentials")
    .delete()
    .eq("social_account_id", accountId)
    .eq("owner_id", ownerId);

  await client
    .from("social_accounts")
    .update({
      status: "disconnected",
      disconnected_at: now.toISOString(),
      token_expires_at: null,
      granted_scopes: [],
    })
    .eq("id", accountId)
    .eq("owner_id", ownerId);
}

/**
 * Store a connection whose platform issues no refresh token.
 *
 * Meta's model has no refresh token: a long-lived access token is the
 * credential and refreshes itself before it expires. `saveConnection` refuses
 * a missing refresh token — correctly, for Google, where its absence means the
 * connection will die within the hour — so Instagram uses this path instead.
 *
 * The difference is deliberate and narrow. Everything else is identical: the
 * same tables, the same AES-256-GCM envelope, the same account row, the same
 * revocation path. What is **not** shared is the pretence that a refresh token
 * exists.
 */
export async function saveLongLivedConnection(
  client: SupabaseClient,
  input: {
    ownerId: string;
    platform: ConnectionPlatform;
    providerAccountId: string;
    displayName: string | null;
    handle: string | null;
    accessToken: string;
    expiresAt: Date;
    grantedScopes: string[];
  },
  now: Date = new Date(),
): Promise<{ ok: true; accountId: string } | { ok: false; reason: string }> {
  const store = getSecretStore();
  if (store === null) {
    return {
      ok: false,
      reason:
        "No token encryption key is configured, so the credential cannot be stored.",
    };
  }

  const { data: accountRow, error: accountError } = await client
    .from("social_accounts")
    .upsert(
      {
        owner_id: input.ownerId,
        platform: input.platform,
        provider_account_id: input.providerAccountId,
        display_name: input.displayName,
        handle: input.handle,
        channel_id: null,
        channel_title: null,
        status: "connected",
        granted_scopes: input.grantedScopes,
        connected_at: now.toISOString(),
        disconnected_at: null,
        token_expires_at: input.expiresAt.toISOString(),
      },
      { onConflict: "owner_id,platform,provider_account_id" },
    )
    .select("id")
    .single();

  if (accountError || !accountRow) {
    return { ok: false, reason: "The connection could not be saved." };
  }

  const accountId = (accountRow as { id: string }).id;

  const { error: credentialError } = await client
    .from("social_account_credentials")
    .upsert(
      {
        owner_id: input.ownerId,
        social_account_id: accountId,
        encrypted_access_token: store.seal(input.accessToken),
        // Null on purpose. There is no refresh token to store, and writing a
        // copy of the access token here would invent a second credential.
        encrypted_refresh_token: null,
        access_token_expires_at: input.expiresAt.toISOString(),
        granted_scopes: input.grantedScopes,
      },
      { onConflict: "social_account_id" },
    );

  if (credentialError) {
    await client
      .from("social_accounts")
      .update({ status: "disconnected", disconnected_at: now.toISOString() })
      .eq("id", accountId)
      .eq("owner_id", input.ownerId);

    return { ok: false, reason: "The credential could not be stored." };
  }

  return { ok: true, accountId };
}

/**
 * Read a stored access token, without refreshing it.
 *
 * For platforms whose refresh is not Google's grant exchange. The caller owns
 * the decision about whether the token is still usable and how to renew it.
 */
export async function readStoredAccessToken(
  client: SupabaseClient,
  account: SocialAccount,
): Promise<{ accessToken: string; expiresAt: string | null } | null> {
  const store = getSecretStore();
  if (store === null) {
    return null;
  }

  const { data } = await client
    .from("social_account_credentials")
    .select("encrypted_access_token, access_token_expires_at")
    .eq("social_account_id", account.id)
    .eq("owner_id", account.owner_id)
    .maybeSingle();

  const row = data as {
    encrypted_access_token: string | null;
    access_token_expires_at: string | null;
  } | null;

  if (!row?.encrypted_access_token) {
    return null;
  }

  try {
    return {
      accessToken: store.open(row.encrypted_access_token),
      expiresAt: row.access_token_expires_at,
    };
  } catch {
    return null;
  }
}
