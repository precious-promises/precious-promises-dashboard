import { encryptionProblem } from "@/lib/crypto/secrets";
import { getServerEnv } from "@/lib/env/server";

import type { TikTokOAuthConfig } from "./oauth";

/**
 * Resolving TikTok credentials from the environment.
 *
 * **Server-only.** Reads `TIKTOK_CLIENT_SECRET`.
 *
 * Returns reasons rather than throwing, so a checkout with no TikTok app still
 * builds, tests and deploys — the Connected Accounts page simply says what is
 * missing.
 *
 * The variable is `TIKTOK_CLIENT_KEY`, matching TikTok's own name for it.
 * Calling it a client id in the environment would invite someone to send it as
 * `client_id`, which TikTok rejects without explaining why.
 */

export interface TikTokConfigResult {
  config: TikTokOAuthConfig | null;
  problems: string[];
}

export function resolveTikTokConfig(): TikTokConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  if (!env.TIKTOK_CLIENT_KEY) {
    problems.push("TIKTOK_CLIENT_KEY is not set.");
  }
  if (!env.TIKTOK_CLIENT_SECRET) {
    problems.push("TIKTOK_CLIENT_SECRET is not set.");
  }
  if (!env.TIKTOK_REDIRECT_URI) {
    problems.push(
      "TIKTOK_REDIRECT_URI is not set. It must exactly match a redirect URI registered on the TikTok app.",
    );
  }

  const encryption = encryptionProblem();
  if (encryption !== null) {
    problems.push(encryption);
  }

  if (
    !env.TIKTOK_CLIENT_KEY ||
    !env.TIKTOK_CLIENT_SECRET ||
    !env.TIKTOK_REDIRECT_URI ||
    encryption !== null
  ) {
    return { config: null, problems };
  }

  return {
    config: {
      clientKey: env.TIKTOK_CLIENT_KEY,
      clientSecret: env.TIKTOK_CLIENT_SECRET,
      redirectUri: env.TIKTOK_REDIRECT_URI,
    },
    problems,
  };
}

export function isTikTokConfigured(): boolean {
  return resolveTikTokConfig().config !== null;
}
