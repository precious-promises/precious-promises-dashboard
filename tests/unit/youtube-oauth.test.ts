// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_REVOKE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  OAUTH_STATE_TTL_SECONDS,
  UPLOAD_SCOPE,
  YOUTUBE_SCOPES,
} from "@/lib/youtube/config";
import {
  buildAuthorizationUrl,
  canUpload,
  describeOAuthError,
  exchangeCode,
  isStateUsable,
  missingScopes,
  newStateToken,
  OAuthError,
  parseTokenResponse,
  refreshAccessToken,
  revokeToken,
  stateExpiry,
  type GoogleOAuthConfig,
} from "@/lib/youtube/oauth";

/**
 * Google OAuth 2.0.
 *
 * No credentials are needed to run any of this: the configuration is a
 * parameter and `fetch` is injected, which is exactly why the flow can be held
 * to account without an account.
 */

const CONFIG: GoogleOAuthConfig = {
  clientId: "test-client-id.apps.googleusercontent.com",
  clientSecret: "test-client-secret",
  redirectUri: "https://example.test/api/oauth/google/callback",
};

const NOW = new Date("2026-08-11T12:00:00Z");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("state tokens", () => {
  it("issues a distinct, high-entropy token each time", () => {
    const a = newStateToken();
    const b = newStateToken();

    expect(a).not.toBe(b);
    // Long enough to be unguessable, and inside the database's 32–200 range.
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a.length).toBeLessThanOrEqual(200);
  });

  it("uses only URL-safe characters, so nothing is mangled in transit", () => {
    expect(newStateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("expires within minutes, not hours", () => {
    expect(stateExpiry(NOW).getTime() - NOW.getTime()).toBe(
      OAUTH_STATE_TTL_SECONDS * 1000,
    );
    expect(OAUTH_STATE_TTL_SECONDS).toBeLessThanOrEqual(900);
  });

  it("accepts a fresh, unused state", () => {
    expect(
      isStateUsable(
        { expires_at: stateExpiry(NOW).toISOString(), consumed_at: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses a consumed state, whatever its expiry says", () => {
    // Single use is what stops a replayed callback.
    expect(
      isStateUsable(
        {
          expires_at: stateExpiry(NOW).toISOString(),
          consumed_at: NOW.toISOString(),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("refuses an expired state", () => {
    expect(
      isStateUsable(
        { expires_at: "2026-08-11T11:00:00Z", consumed_at: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("refuses an unparseable expiry rather than treating it as valid", () => {
    expect(
      isStateUsable({ expires_at: "not a date", consumed_at: null }, NOW),
    ).toBe(false);
  });
});

describe("the authorisation URL", () => {
  const url = new URL(buildAuthorizationUrl(CONFIG, "state-value"));

  it("points at Google's authorisation endpoint", () => {
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_ENDPOINT);
  });

  it("asks for offline access with a fresh consent", () => {
    // Without both, Google issues no refresh token and the connection dies at
    // the first expiry.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("carries the state", () => {
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("requests exactly the three scopes this product uses", () => {
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...YOUTUBE_SCOPES,
    ]);
  });

  it("never asks for youtubepartner or force-ssl", () => {
    // Both grant far more than this product does. An unused broad scope is a
    // standing risk with no benefit.
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).not.toContain("youtubepartner");
    expect(scope).not.toContain("force-ssl");
  });

  it("never puts the client secret in the URL", () => {
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe("reading a token response", () => {
  it("computes an absolute expiry from expires_in", () => {
    const tokens = parseTokenResponse(
      {
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_in: 3599,
        scope: YOUTUBE_SCOPES.join(" "),
        token_type: "Bearer",
      },
      NOW,
    );

    expect(tokens.accessToken).toBe("ya29.access");
    expect(tokens.refreshToken).toBe("1//refresh");
    expect(tokens.expiresAt.getTime()).toBe(NOW.getTime() + 3_599_000);
    expect(tokens.grantedScopes).toEqual([...YOUTUBE_SCOPES]);
  });

  it("reports a missing refresh token as null rather than an empty string", () => {
    // A refresh response does not repeat the refresh token. Null is what tells
    // the caller to keep the stored one instead of overwriting it with nothing.
    const tokens = parseTokenResponse(
      { access_token: "ya29.access", expires_in: 3599 },
      NOW,
    );

    expect(tokens.refreshToken).toBeNull();
  });

  it("throws rather than returning an empty access token", () => {
    expect(() => parseTokenResponse({ expires_in: 3599 }, NOW)).toThrow(
      OAuthError,
    );
    expect(() =>
      parseTokenResponse({ access_token: "", expires_in: 3599 }, NOW),
    ).toThrow(OAuthError);
  });

  it("raises Google's error code", () => {
    try {
      parseTokenResponse(
        { error: "invalid_grant", error_description: "Token has been expired" },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as OAuthError).code).toBe("invalid_grant");
    }
  });

  it("never carries Google's error_description into the message", () => {
    // `error_description` can quote the request, including parameters.
    try {
      parseTokenResponse(
        {
          error: "invalid_request",
          error_description: `client_secret=${CONFIG.clientSecret}`,
        },
        NOW,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain(CONFIG.clientSecret);
    }
  });

  it("refuses a non-object payload", () => {
    expect(() => parseTokenResponse(null, NOW)).toThrow(OAuthError);
    expect(() => parseTokenResponse("nope", NOW)).toThrow(OAuthError);
  });
});

describe("error descriptions", () => {
  it("explains invalid_grant as a reconnection, not a retry", () => {
    expect(describeOAuthError("invalid_grant")).toMatch(/reconnect/i);
  });

  it("gives an unfamiliar code a safe description", () => {
    expect(describeOAuthError("something_new").length).toBeGreaterThan(10);
  });
});

describe("granted scopes", () => {
  it("recognises a connection that can upload", () => {
    expect(canUpload([...YOUTUBE_SCOPES])).toBe(true);
  });

  it("refuses one where upload was unticked at the consent screen", () => {
    // Google lets scopes be declined individually. A connection that cannot
    // upload is not a working connection.
    expect(canUpload(YOUTUBE_SCOPES.filter((s) => s !== UPLOAD_SCOPE))).toBe(
      false,
    );
    expect(canUpload([])).toBe(false);
  });

  it("names what was not granted", () => {
    expect(missingScopes([UPLOAD_SCOPE])).toEqual(
      YOUTUBE_SCOPES.filter((scope) => scope !== UPLOAD_SCOPE),
    );
  });
});

describe("exchanging an authorisation code", () => {
  it("posts to Google's token endpoint with the secret in the body", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "ya29.access",
        refresh_token: "1//refresh",
        expires_in: 3599,
        scope: YOUTUBE_SCOPES.join(" "),
      }),
    );

    await exchangeCode(CONFIG, "auth-code", fetchImpl as never, NOW);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(GOOGLE_TOKEN_ENDPOINT);
    expect(init.method).toBe("POST");
    // Never in a URL, where every proxy and access log on the way would keep it.
    expect(url).not.toContain(CONFIG.clientSecret);
    expect(String(init.body)).toContain("grant_type=authorization_code");
  });

  it("throws on Google's error payload", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "invalid_grant" }, 400),
    );

    await expect(
      exchangeCode(CONFIG, "auth-code", fetchImpl as never, NOW),
    ).rejects.toThrow(OAuthError);
  });

  it("throws a readable error when Google returns something that is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    );

    await expect(
      exchangeCode(CONFIG, "auth-code", fetchImpl as never, NOW),
    ).rejects.toThrow(/not JSON/i);
  });

  it("throws on an empty response rather than producing empty tokens", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    await expect(
      exchangeCode(CONFIG, "auth-code", fetchImpl as never, NOW),
    ).rejects.toThrow(OAuthError);
  });
});

describe("refreshing", () => {
  it("sends grant_type=refresh_token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ access_token: "ya29.new", expires_in: 3599 }),
    );

    const tokens = await refreshAccessToken(
      CONFIG,
      "1//refresh",
      fetchImpl as never,
      NOW,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(tokens.accessToken).toBe("ya29.new");
    // Google does not repeat it, and the caller keeps the stored one.
    expect(tokens.refreshToken).toBeNull();
  });

  it("surfaces invalid_grant, so the account can be marked for reconnection", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: "invalid_grant" }, 400),
    );

    try {
      await refreshAccessToken(CONFIG, "1//dead", fetchImpl as never, NOW);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as OAuthError).code).toBe("invalid_grant");
    }
  });
});

describe("revoking", () => {
  it("posts the token to Google's revoke endpoint", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    expect(await revokeToken("1//refresh", fetchImpl as never)).toBe(true);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(GOOGLE_REVOKE_ENDPOINT);
    expect(init.method).toBe("POST");
    // In the body, not the query string.
    expect(url).not.toContain("1//refresh");
  });

  it("reports a refusal rather than claiming success", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 400 }));

    expect(await revokeToken("1//refresh", fetchImpl as never)).toBe(false);
  });

  it("reports a network failure rather than throwing into the disconnect", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("fetch failed");
    });

    expect(await revokeToken("1//refresh", fetchImpl as never)).toBe(false);
  });
});
