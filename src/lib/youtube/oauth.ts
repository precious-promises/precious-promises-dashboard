import { randomBytes } from "node:crypto";

import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  OAUTH_STATE_TTL_SECONDS,
  UPLOAD_SCOPE,
  YOUTUBE_SCOPES,
} from "./config";

/**
 * Google OAuth 2.0, web server flow.
 *
 * The shape of the flow, and why each part is here:
 *
 * 1. This application sends the owner to Google with a `state` it generated
 *    and stored. Google sends the owner back with a `code` and that same
 *    `state`.
 * 2. The `state` is checked and **consumed**. Without it, anyone could send
 *    Dave a crafted callback URL and attach their own channel to his account.
 * 3. The `code` is exchanged for tokens **server-side**, using the client
 *    secret. The secret never reaches a browser and the code never travels
 *    through one after this point.
 *
 * `access_type=offline` with `prompt=consent` is what produces a refresh
 * token. Google returns one only on a fresh consent — a second authorisation
 * of an already-authorised app returns an access token and nothing else, which
 * is why the code below treats a missing refresh token on reconnect as normal
 * and a missing one on first connect as a failure.
 *
 * The functions here take their configuration as arguments rather than reading
 * the environment, so the whole flow is testable with no credentials present.
 */

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * A high-entropy state token.
 *
 * 32 bytes, base64url. The migration constrains the column to 32–200
 * characters, so a short or predictable value is refused by the database as
 * well as unproduced by this function.
 */
export function newStateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** When a freshly issued state stops being valid. */
export function stateExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + OAUTH_STATE_TTL_SECONDS * 1000);
}

/**
 * Whether a stored state may still be used.
 *
 * A consumed state is never valid again, whatever its expiry says. That is the
 * single-use property, and it is what stops a replayed callback.
 */
export function isStateUsable(
  state: { expires_at: string; consumed_at: string | null },
  now: Date = new Date(),
): boolean {
  if (state.consumed_at !== null) {
    return false;
  }

  const expiry = Date.parse(state.expires_at);
  return !Number.isNaN(expiry) && expiry > now.getTime();
}

/**
 * The URL the owner is sent to.
 *
 * `include_granted_scopes=true` asks Google to carry forward scopes already
 * granted, so re-authorising for one more capability does not silently drop
 * the others.
 */
export function buildAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  url.searchParams.set("state", state);
  // Without both of these there is no refresh token, and the connection dies
  // the first time an access token expires.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  return url.toString();
}

/**
 * A token response, reduced to what this application stores.
 *
 * `refreshToken` is null when Google did not issue one — which is normal on a
 * re-authorisation and is handled by keeping the existing stored token rather
 * than overwriting it with nothing.
 */
export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  grantedScopes: string[];
}

/** Raised when Google refuses, or answers something unusable. */
export class OAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
  }
}

/**
 * Read a token endpoint response.
 *
 * Deliberately strict. A response missing `access_token` is an error rather
 * than a `TokenSet` with an empty string in it — an empty credential would
 * fail later, somewhere less obvious, as an authentication error nobody could
 * explain.
 *
 * `expires_in` is seconds from now, so the absolute expiry is computed against
 * a clock the caller supplies.
 */
export function parseTokenResponse(
  payload: unknown,
  now: Date = new Date(),
): TokenSet {
  if (typeof payload !== "object" || payload === null) {
    throw new OAuthError("invalid_response", "Google returned no token data.");
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.error === "string") {
    // `error_description` can quote the request. It is not carried into the
    // message; the error code is enough to act on and cannot leak a secret.
    throw new OAuthError(body.error, describeOAuthError(body.error));
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new OAuthError(
      "invalid_response",
      "Google's response contained no access token.",
    );
  }

  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 0;

  const refreshToken =
    typeof body.refresh_token === "string" && body.refresh_token !== ""
      ? body.refresh_token
      : null;

  const grantedScopes =
    typeof body.scope === "string"
      ? body.scope.split(" ").filter((scope) => scope !== "")
      : [];

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    grantedScopes,
  };
}

/**
 * Plain-English text for Google's documented OAuth error codes.
 *
 * Mapped rather than passed through, so nothing Google puts in
 * `error_description` — which can include request parameters — is ever stored.
 */
export function describeOAuthError(code: string): string {
  switch (code) {
    case "access_denied":
      return "Authorisation was declined at Google.";
    case "invalid_grant":
      return "Google rejected the stored authorisation. It has expired, been revoked, or the account password changed. Reconnect to restore access.";
    case "invalid_client":
      return "Google did not recognise this application's credentials.";
    case "invalid_request":
      return "Google rejected the authorisation request as malformed.";
    case "unauthorized_client":
      return "This application is not authorised to use this grant type.";
    case "invalid_scope":
      return "Google rejected one of the requested permissions.";
    case "redirect_uri_mismatch":
      return "The redirect URI does not match the one registered in Google Cloud Console.";
    default:
      return "Google refused the authorisation.";
  }
}

/**
 * Whether the granted scopes are enough to publish.
 *
 * Google may grant fewer scopes than were asked for — the consent screen lets
 * the user untick them. A connection that cannot upload is recorded honestly
 * as such rather than presented as working.
 */
export function canUpload(grantedScopes: readonly string[]): boolean {
  return grantedScopes.includes(UPLOAD_SCOPE);
}

/** Scopes that were asked for but not granted. */
export function missingScopes(grantedScopes: readonly string[]): string[] {
  return YOUTUBE_SCOPES.filter((scope) => !grantedScopes.includes(scope));
}

/**
 * Exchange an authorisation code for tokens.
 *
 * The client secret goes in the POST body over TLS, which is what Google's web
 * server flow specifies. It is never placed in a URL, where it would be
 * recorded by every proxy and access log on the way.
 */
export async function exchangeCode(
  config: GoogleOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<TokenSet> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  return parseTokenResponse(await readJson(response), now);
}

/**
 * Exchange a refresh token for a new access token.
 *
 * `invalid_grant` here is the important case: it means the refresh token is
 * dead — revoked in the Google account, expired, or invalidated by a password
 * change. The account is moved to `needs_reconnect` rather than retried,
 * because retrying a revoked grant will be refused forever.
 */
export async function refreshAccessToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<TokenSet> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });

  const tokens = parseTokenResponse(await readJson(response), now);

  // A refresh response does not repeat the refresh token. Returning null here
  // and keeping the stored one is what stops a refresh from erasing it.
  return tokens;
}

/**
 * Revoke a token at Google.
 *
 * Called on disconnect. Deleting our copy alone would leave a live grant on
 * Dave's Google account that nothing in this interface could see or withdraw —
 * so the revocation happens first, and the local delete follows regardless of
 * whether Google answered, because a local record of a connection we no longer
 * intend to use is worse than a revocation that has to be repeated by hand.
 *
 * Returns whether Google confirmed. A `false` is reported to the owner, not
 * swallowed.
 */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Read a JSON body without letting a non-JSON error page throw something
 * unhelpful.
 *
 * Google's token endpoint returns JSON for both success and failure, but an
 * intercepting proxy or an outage page will not.
 */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === "") {
    throw new OAuthError(
      "invalid_response",
      `Google returned an empty response (HTTP ${response.status}).`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OAuthError(
      "invalid_response",
      `Google returned a response that was not JSON (HTTP ${response.status}).`,
    );
  }
}
