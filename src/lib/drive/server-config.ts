import { encryptionProblem } from "@/lib/crypto/secrets";
import { getServerEnv } from "@/lib/env/server";
import type { GoogleOAuthConfig } from "@/lib/youtube/oauth";

/**
 * Resolving the Drive connection's configuration.
 *
 * **Server-only.** Reads `GOOGLE_CLIENT_SECRET`, so importing it from a Client
 * Component fails the boundary test.
 *
 * Drive reuses the same Google OAuth client as YouTube — one Google Cloud
 * project, one consent screen, one redirect URI — but requests a different
 * scope and stores a **separate** account row. That separation matters:
 * disconnecting the channel must not silently take the media library with it.
 *
 * Returns reasons rather than throwing, because a fresh checkout has none of
 * this and `next build`, `pnpm test` and CI all have to succeed there.
 */

export interface DriveConfigResult {
  config: GoogleOAuthConfig | null;
  /** The approved folder. Nothing outside it is reachable. */
  rootFolderId: string | null;
  problems: string[];
}

export function resolveDriveConfig(): DriveConfigResult {
  const env = getServerEnv();
  const problems: string[] = [];

  if (!env.GOOGLE_CLIENT_ID) {
    problems.push("GOOGLE_CLIENT_ID is not set.");
  }
  if (!env.GOOGLE_CLIENT_SECRET) {
    problems.push("GOOGLE_CLIENT_SECRET is not set.");
  }
  if (!env.GOOGLE_REDIRECT_URI) {
    problems.push("GOOGLE_REDIRECT_URI is not set.");
  }
  if (!env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    problems.push(
      "GOOGLE_DRIVE_ROOT_FOLDER_ID is not set, so no folder is approved for use and nothing can be read from Drive.",
    );
  }

  const encryption = encryptionProblem();
  if (encryption !== null) {
    problems.push(encryption);
  }

  const usable =
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REDIRECT_URI &&
    env.GOOGLE_DRIVE_ROOT_FOLDER_ID &&
    encryption === null;

  if (!usable) {
    return {
      config: null,
      rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? null,
      problems,
    };
  }

  return {
    config: {
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
      redirectUri: env.GOOGLE_REDIRECT_URI as string,
    },
    rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID as string,
    problems,
  };
}

export function isDriveConfigured(): boolean {
  return resolveDriveConfig().config !== null;
}
