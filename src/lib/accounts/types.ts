import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Connected external accounts.
 *
 * A `social_accounts` row is **identity only** — which channel, under whose
 * ownership, in what state. Credentials live in a separate table the browser
 * cannot read at all, and nothing in this module ever holds a token.
 *
 * That separation is the point. A page renders account rows; if a token were a
 * column on the same row, rendering the page would put it in a payload.
 */

export const ACCOUNT_STATUSES = [
  "connected",
  "disconnected",
  "needs_reconnect",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  connected: "Connected",
  disconnected: "Not connected",
  needs_reconnect: "Reconnection needed",
};

export const ACCOUNT_STATUS_DETAIL: Record<AccountStatus, string> = {
  connected: "This channel can be published to.",
  disconnected: "No authorisation has been granted, so nothing can be sent.",
  needs_reconnect:
    "The platform rejected the stored authorisation. Reconnect to restore access.",
};

/**
 * A connected account, as the browser sees it.
 *
 * There is no token field, and there is no field that could hold one. The
 * `social_account_credentials` table is unreachable from the browser by
 * construction — RLS is enabled on it with no policies at all.
 */
export interface SocialAccount {
  id: string;
  owner_id: string;
  platform: VariantPlatform;
  provider_account_id: string;
  display_name: string | null;
  handle: string | null;
  channel_id: string | null;
  channel_title: string | null;
  status: AccountStatus;
  granted_scopes: string[];
  connected_at: string | null;
  disconnected_at: string | null;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stored credentials. **Server-only.**
 *
 * Both token fields hold versioned AES-256-GCM envelopes, never plaintext, and
 * this type exists so the server code that handles them is typed — not so they
 * can be passed around. Nothing that renders may accept this shape.
 */
export interface SocialAccountCredentials {
  id: string;
  owner_id: string;
  social_account_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  granted_scopes: string[];
  created_at: string;
  updated_at: string;
}

/**
 * How close to expiry an access token may get before it is refreshed.
 *
 * Sixty seconds of headroom. A token that expires mid-upload fails an upload
 * that was otherwise fine, and the refresh costs one HTTP round trip.
 */
export const TOKEN_REFRESH_SKEW_SECONDS = 60;

/** True when an access token should be refreshed before being used. */
export function needsRefresh(
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  if (expiresAt === null) {
    // No recorded expiry means nothing is known about the token's life.
    // Refreshing is cheap; using a possibly-dead token is not.
    return true;
  }

  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) {
    return true;
  }

  return expiry - now.getTime() <= TOKEN_REFRESH_SKEW_SECONDS * 1000;
}

/** True when this account is in a state that could publish. */
export function isPublishable(account: SocialAccount | null): boolean {
  return account !== null && account.status === "connected";
}

/**
 * How an account should be described when it has no display name.
 *
 * Never invents one. If the platform gave no title, the account is described
 * by what is actually known about it.
 */
export function accountLabel(account: SocialAccount): string {
  return (
    account.channel_title ??
    account.display_name ??
    account.handle ??
    `Channel ${account.provider_account_id}`
  );
}
