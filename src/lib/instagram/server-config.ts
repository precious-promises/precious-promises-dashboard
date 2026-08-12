import { encryptionProblem } from "@/lib/crypto/secrets";
import { getServerEnv } from "@/lib/env/server";

import type { MetaOAuthConfig } from "./oauth";

/**
 * Resolving Meta credentials from the environment.
 *
 * **Server-only.** Reads `META_APP_SECRET`.
 *
 * Returns reasons rather than throwing, so a checkout with no Meta app still
 * builds, tests and deploys — the Connected Accounts page simply says what is
 * missing.
 */

export interface InstagramConfigResult {
  config: MetaOAuthConfig | null;
  problems: string[];
}

export function resolveInstagramConfig(): InstagramConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  if (!env.META_APP_ID) {
    problems.push("META_APP_ID is not set.");
  }
  if (!env.META_APP_SECRET) {
    problems.push("META_APP_SECRET is not set.");
  }
  if (!env.META_REDIRECT_URI) {
    problems.push(
      "META_REDIRECT_URI is not set. It must exactly match a redirect URI registered on the Meta app.",
    );
  }

  const encryption = encryptionProblem();
  if (encryption !== null) {
    problems.push(encryption);
  }

  if (
    !env.META_APP_ID ||
    !env.META_APP_SECRET ||
    !env.META_REDIRECT_URI ||
    encryption !== null
  ) {
    return { config: null, problems };
  }

  return {
    config: {
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      redirectUri: env.META_REDIRECT_URI,
    },
    problems,
  };
}

export function isInstagramConfigured(): boolean {
  return resolveInstagramConfig().config !== null;
}
