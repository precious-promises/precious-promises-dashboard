import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConnectionPlatform } from "./types";
import { isStateUsable, newStateToken, stateExpiry } from "@/lib/youtube/oauth";

/**
 * Single-use OAuth state tokens.
 *
 * The state is the only thing standing between Dave and a crafted callback
 * URL that attaches somebody else's channel to his account. It has to be
 * unguessable, bound to him, short-lived, and usable exactly once.
 *
 * All four are enforced in two places. Here: 32 random bytes, an owner
 * column, a ten-minute expiry, and a consume step that writes `consumed_at`
 * before the code is exchanged. And in the database: a unique constraint on
 * the token, a length check, and RLS enabled with **no policies**, so the
 * table cannot be read from a browser at all. A readable state token is a
 * guessable one.
 */

export interface OAuthStateRow {
  id: string;
  owner_id: string;
  platform: ConnectionPlatform;
  state: string;
  expires_at: string;
  consumed_at: string | null;
}

/** Issue a state token and store it. Returns the token to put in the URL. */
export async function createOAuthState(
  client: SupabaseClient,
  ownerId: string,
  platform: ConnectionPlatform,
  now: Date = new Date(),
): Promise<string | null> {
  const state = newStateToken();

  const { error } = await client.from("oauth_states").insert({
    owner_id: ownerId,
    platform,
    state,
    expires_at: stateExpiry(now).toISOString(),
  });

  return error ? null : state;
}

export type StateConsumption =
  | { ok: true; ownerId: string; platform: ConnectionPlatform }
  | { ok: false; reason: string };

/**
 * Consume a state token, or explain why it cannot be used.
 *
 * The consume happens **before** the authorisation code is exchanged, not
 * after. If it happened after, two callbacks arriving together would both pass
 * the check and both exchange the code.
 *
 * The update is conditional on `consumed_at is null`, so the database decides
 * which of two racing callbacks wins — a read-then-write here would let both
 * of them see `null`.
 */
export async function consumeOAuthState(
  client: SupabaseClient,
  state: string,
  now: Date = new Date(),
): Promise<StateConsumption> {
  const { data } = await client
    .from("oauth_states")
    .select("id, owner_id, platform, state, expires_at, consumed_at")
    .eq("state", state)
    .maybeSingle();

  const row = (data as OAuthStateRow | null) ?? null;

  if (row === null) {
    // Deliberately the same message for "never existed" and "already used".
    // Distinguishing them tells an attacker which of the two they achieved.
    return { ok: false, reason: "This authorisation link is not valid." };
  }

  if (!isStateUsable(row, now)) {
    return {
      ok: false,
      reason:
        "This authorisation link has expired or was already used. Start the connection again.",
    };
  }

  const { data: claimed } = await client
    .from("oauth_states")
    .update({ consumed_at: now.toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return {
      ok: false,
      reason:
        "This authorisation link has expired or was already used. Start the connection again.",
    };
  }

  return { ok: true, ownerId: row.owner_id, platform: row.platform };
}

/**
 * Remove states that can no longer be used.
 *
 * Housekeeping, not security — an expired state is already refused. Called
 * when a new one is issued, so the table does not grow without bound in a
 * system that has no scheduled cleanup job.
 */
export async function pruneExpiredStates(
  client: SupabaseClient,
  now: Date = new Date(),
): Promise<void> {
  await client
    .from("oauth_states")
    .delete()
    .lt("expires_at", new Date(now.getTime() - 60_000).toISOString());
}
