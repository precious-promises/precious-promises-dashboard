import {
  INSTAGRAM_AUTH_ENDPOINT,
  INSTAGRAM_GRAPH_BASE,
  INSTAGRAM_SCOPES,
  INSTAGRAM_TOKEN_ENDPOINT,
  PUBLISH_SCOPE,
} from "./config";

/**
 * Instagram OAuth — Business Login for Instagram.
 *
 * The flow has **four** steps, not Google's two, and the extra ones matter:
 *
 * 1. Send the owner to Meta with a single-use `state`.
 * 2. Exchange the returned `code` for a **short-lived** token (about an hour).
 * 3. Exchange that for a **long-lived** token (60 days). Skipping this leaves a
 *    connection that dies within the hour.
 * 4. Later, refresh the long-lived token by presenting it before it expires.
 *
 * There is no refresh token anywhere in this. The long-lived token *is* the
 * credential and refreshes itself, which is why a connection left unused for
 * 60 days simply dies — nothing here can prevent that, and the interface says
 * so rather than letting it surface as a failed publish.
 */

export interface MetaOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export class InstagramOAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "InstagramOAuthError";
    this.code = code;
  }
}

/** A long-lived credential, reduced to what is stored. */
export interface InstagramTokenSet {
  accessToken: string;
  expiresAt: Date;
  grantedScopes: string[];
}

export function buildInstagramAuthorizationUrl(
  config: MetaOAuthConfig,
  state: string,
): string {
  const url = new URL(INSTAGRAM_AUTH_ENDPOINT);

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  url.searchParams.set("state", state);

  return url.toString();
}

/** Whether the granted permissions are enough to publish. */
export function canPublish(grantedScopes: readonly string[]): boolean {
  return grantedScopes.includes(PUBLISH_SCOPE);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.trim() === "") {
    throw new InstagramOAuthError(
      "invalid_response",
      `Meta returned an empty response (HTTP ${response.status}).`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new InstagramOAuthError(
      "invalid_response",
      `Meta returned a response that was not JSON (HTTP ${response.status}).`,
    );
  }
}

/**
 * Read Meta's error shape without carrying its text forward.
 *
 * Meta's `error_message` can quote the request, including parameters. Only a
 * mapped sentence is surfaced.
 */
function throwIfError(body: unknown): void {
  if (typeof body !== "object" || body === null) {
    return;
  }

  const record = body as Record<string, unknown>;
  const nested = record.error as Record<string, unknown> | undefined;

  const type =
    (typeof record.error_type === "string" ? record.error_type : null) ??
    (typeof nested?.type === "string" ? nested.type : null);

  if (type !== null) {
    throw new InstagramOAuthError(type, describeInstagramOAuthError(type));
  }
}

export function describeInstagramOAuthError(code: string): string {
  switch (code) {
    case "OAuthException":
      return "Meta rejected the authorisation. It may have expired, or the app may not have the permission it asked for.";
    case "access_denied":
      return "Authorisation was declined at Instagram.";
    case "invalid_request":
      return "Meta rejected the authorisation request as malformed.";
    case "invalid_response":
      return "Meta returned a response this application could not read.";
    default:
      return "Meta refused the authorisation.";
  }
}

/**
 * Step 2 — exchange the code for a short-lived token.
 *
 * The app secret goes in the POST body over TLS, never in a URL.
 */
export async function exchangeInstagramCode(
  config: MetaOAuthConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; userId: string; permissions: string[] }> {
  const response = await fetchImpl(INSTAGRAM_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
    }).toString(),
  });

  const body = await readJson(response);
  throwIfError(body);

  const record = body as Record<string, unknown>;
  const accessToken = record.access_token;

  if (typeof accessToken !== "string" || accessToken === "") {
    throw new InstagramOAuthError(
      "invalid_response",
      "Meta's response contained no access token.",
    );
  }

  const permissions =
    typeof record.permissions === "string"
      ? record.permissions
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : Array.isArray(record.permissions)
        ? record.permissions.filter((p): p is string => typeof p === "string")
        : [];

  return {
    accessToken,
    userId:
      typeof record.user_id === "string"
        ? record.user_id
        : String(record.user_id ?? ""),
    permissions,
  };
}

/**
 * Step 3 — exchange the short-lived token for a long-lived one.
 *
 * Skipping this leaves a connection that stops working within the hour, which
 * would present as a working connection that mysteriously fails.
 */
export async function exchangeForLongLivedToken(
  config: MetaOAuthConfig,
  shortLivedToken: string,
  grantedScopes: string[],
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<InstagramTokenSet> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetchImpl(url.toString(), { method: "GET" });
  const body = await readJson(response);
  throwIfError(body);

  return parseLongLivedToken(body, grantedScopes, now);
}

/**
 * Step 4 — refresh a long-lived token.
 *
 * Presents the token itself. A token that has already expired cannot be
 * refreshed, and that is a reconnection, not a retry.
 */
export async function refreshLongLivedToken(
  accessToken: string,
  grantedScopes: string[],
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<InstagramTokenSet> {
  const url = new URL(`${INSTAGRAM_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const response = await fetchImpl(url.toString(), { method: "GET" });
  const body = await readJson(response);
  throwIfError(body);

  return parseLongLivedToken(body, grantedScopes, now);
}

export function parseLongLivedToken(
  payload: unknown,
  grantedScopes: string[],
  now: Date = new Date(),
): InstagramTokenSet {
  if (typeof payload !== "object" || payload === null) {
    throw new InstagramOAuthError(
      "invalid_response",
      "Meta returned no token data.",
    );
  }

  const body = payload as Record<string, unknown>;
  const accessToken = body.access_token;

  if (typeof accessToken !== "string" || accessToken === "") {
    throw new InstagramOAuthError(
      "invalid_response",
      "Meta's response contained no access token.",
    );
  }

  const expiresIn =
    typeof body.expires_in === "number" && Number.isFinite(body.expires_in)
      ? body.expires_in
      : 0;

  if (expiresIn <= 0) {
    // Without an expiry there is no way to know when to refresh, and a token
    // that silently dies is worse than a connection that refuses to be made.
    throw new InstagramOAuthError(
      "invalid_response",
      "Meta returned a token with no lifetime, so it cannot be refreshed safely.",
    );
  }

  return {
    accessToken,
    expiresAt: new Date(now.getTime() + expiresIn * 1000),
    grantedScopes,
  };
}
