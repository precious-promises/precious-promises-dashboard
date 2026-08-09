import { encryptionProblem } from "@/lib/crypto/secrets";
import { getServerEnv } from "@/lib/env/server";

import type { GoogleOAuthConfig } from "./oauth";

/**
 * Resolving Google credentials from the environment.
 *
 * **Server-only.** Reads `GOOGLE_CLIENT_SECRET`, so importing this from a
 * Client Component is a boundary violation that
 * `tests/unit/client-secret-boundary.test.ts` fails the build on.
 *
 * Returns a reason rather than throwing when configuration is missing. A fresh
 * checkout has none of these, and `next build`, `pnpm test` and CI must all
 * succeed there — so "not configured" is an ordinary state the interface
 * reports, not an exception.
 *
 * The reasons name variables and never their values.
 */

export interface YouTubeConfigResult {
  config: GoogleOAuthConfig | null;
  /** Every reason the integration cannot run, for display. */
  problems: string[];
}

export function resolveYouTubeConfig(): YouTubeConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  if (!env.GOOGLE_CLIENT_ID) {
    problems.push("GOOGLE_CLIENT_ID is not set.");
  }
  if (!env.GOOGLE_CLIENT_SECRET) {
    problems.push("GOOGLE_CLIENT_SECRET is not set.");
  }
  if (!env.GOOGLE_REDIRECT_URI) {
    problems.push(
      "GOOGLE_REDIRECT_URI is not set. It must exactly match the redirect URI registered in Google Cloud Console.",
    );
  }

  // Without encryption there is nowhere safe to put a refresh token, so
  // connecting is refused rather than storing one in plaintext.
  const encryption = encryptionProblem();
  if (encryption !== null) {
    problems.push(encryption);
  }

  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REDIRECT_URI ||
    encryption !== null
  ) {
    return { config: null, problems };
  }

  return {
    config: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    },
    problems,
  };
}

/** Whether a YouTube connection could be established at all. */
export function isYouTubeConfigured(): boolean {
  return resolveYouTubeConfig().config !== null;
}
