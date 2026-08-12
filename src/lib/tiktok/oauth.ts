import {
  ACCESS_TOKEN_SECONDS,
  PUBLISH_SCOPE,
  TIKTOK_AUTH_ENDPOINT,
  TIKTOK_REVOKE_ENDPOINT,
  TIKTOK_SCOPES,
  TIKTOK_TOKEN_ENDPOINT,
  UPLOAD_SCOPE,
} from "./config";

/**
 * TikTok Login Kit, OAuth v2.
 *
 * A third token model, different again from Google's and Meta's:
 *
 * - Google issues a refresh token that lives until revoked.
 * - Meta issues no refresh token; a long-lived token refreshes itself.
 * - **TikTok issues both**, but the access token lasts only 24 hours and the
 *   refresh token expires after 365 days *of inactivity*.
 *
 * So TikTok looks like Google and is refreshed like Google — the difference is
 * how quickly it matters. A day-old access token is already dead, which makes
 * refreshing on nearly every publish the normal case rather than the exception.
 *
 * TikTok's own naming is `client_key`, not `client_id`. Using Google's name
 * here would produce a request TikTok rejects for a reason its error message
 * does not explain.
 */

export interface TikTokOAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}

export class TikTokOAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TikTokOAuthError";
    this.code = code;
  }
}

export interface TikTokTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  grantedScopes: string[];
  /** TikTok's stable identifier for the authorised user. */
  openId: string | null;
}

export function buildTikTokAuthorizationUrl(
  config: TikTokOAuthConfig,
  state: string,
): string {
  const url = new URL(TIKTOK_AUTH_ENDPOINT);

  url.searchParams.set("client_key", config.clientKey);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  url.searchParams.set("state", state);

  return url.toString();
}

/** Whether the granted scopes allow a direct, visible post. */
export function canDirectPost(grantedScopes: readonly string[]): boolean {
  return grantedScopes.includes(PUBLISH_SCOPE);
}

/** Whether the granted scopes allow an upload to the creator's drafts. */
export function canUploadToDrafts(grantedScopes: readonly string[]): boolean {
  return grantedScopes.includes(UPLOAD_SCOPE);
}

/** Scopes asked for but not granted. */
export function missingScopes(grantedScopes: readonly string[]): string[] {
  return TIKTOK_SCOPES.filter((scope) => !grantedScopes.includes(scope));
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === "") {
    throw new TikTokOAuthError(
      "invalid_response",
      `TikTok returned an empty response (HTTP ${response.status}).`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TikTokOAuthError(
      "invalid_response",
      `TikTok returned a response that was not JSON (HTTP ${response.status}).`,
    );
  }
}

export function describeTikTokOAuthError(code: string): string {
  switch (code) {
    case "access_denied":
      return "Authorisation was declined at TikTok.";
    case "invalid_grant":
      return "TikTok rejected the stored authorisation. It has expired or been revoked. Reconnect to restore access.";
    case "invalid_client":
      return "TikTok did not recognise this application's credentials.";
    case "invalid_request":
      return "TikTok rejected the authorisation request as malformed.";
    case "invalid_scope":
      return "TikTok rejected one of the requested permissions.";
    case "invalid_response":
      return "TikTok returned a response this application could not read.";
    default:
      return "TikTok refused the authorisation.";
  }
}

/**
 * Read a token response.
 *
 * TikTok reports failures as an `error` field alongside HTTP 200, so the body
 * is inspected rather than the status. `error_description` can quote the
 * request, so it is never carried into the message.
 */
export function parseTikTokTokenResponse(
  payload: unknown,
  now: Date = new Date(),
): TikTokTokenSet {
  if (typeof payload !== "object" || payload === null) {
    throw new TikTokOAuthError(
      "invalid_response",
      "TikTok returned no token data.",
    );
  }

  const body = payload as Record<string, unknown>;

  if (typeof body.error === "string" && body.error !== "") {
    throw new TikTokOAuthError(
      body.error,
      describeTikTokOAuthError(body.error),
    );
  }

  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new TikTokOAuthError(
      "invalid_response",
      "TikTok's response contained no access token.",
    );
  }

  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : ACCESS_TOKEN_SECONDS;

  const refreshToken =
    typeof body.refresh_token === "string" && body.refresh_token !== ""
      ? body.refresh_token
      : null;

  const grantedScopes =
    typeof body.scope === "string"
      ? body.scope
          .split(",")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    grantedScopes,
    openId: typeof body.open_id === "string" ? body.open_id : null,
  };
}

/**
 * Exchange an authorisation code for tokens.
 *
 * The client secret goes in the POST body over TLS. Never in a URL, where
 * every proxy and access log on the way would keep it.
 */
export async function exchangeTikTokCode(
  config: TikTokOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<TikTokTokenSet> {
  const response = await fetchImpl(TIKTOK_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // TikTok's token endpoint rejects a cached response, and says so.
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  return parseTikTokTokenResponse(await readJson(response), now);
}

/**
 * Exchange a refresh token for a new access token.
 *
 * Expected to run often: an access token lasts a day, so most publishes will
 * find theirs already expired.
 */
export async function refreshTikTokToken(
  config: TikTokOAuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<TikTokTokenSet> {
  const response = await fetchImpl(TIKTOK_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  return parseTikTokTokenResponse(await readJson(response), now);
}

/**
 * Revoke a token at TikTok.
 *
 * Called on disconnect, before the local credential is deleted — the same
 * order as Google, for the same reason: a live grant nobody can see is worse
 * than one that is visibly still there.
 *
 * Returns whether TikTok confirmed. A `false` is reported to the owner rather
 * than swallowed.
 */
export async function revokeTikTokToken(
  config: TikTokOAuthConfig,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(TIKTOK_REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        token,
      }).toString(),
    });

    if (!response.ok) {
      return false;
    }

    // TikTok can answer 200 with an error body, so success is read from the
    // body rather than assumed from the status.
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    return body === null || !body.error;
  } catch {
    return false;
  }
}
