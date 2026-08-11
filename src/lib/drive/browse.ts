import { getLiveCredential } from "@/lib/accounts/credentials";
import type { SocialAccount } from "@/lib/accounts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";

import { listFolder, type DriveRequestContext } from "./api";
import { isInsideRoot } from "./root";
import { resolveDriveConfig } from "./server-config";
import type { DriveFile } from "./types";

/**
 * Reading the approved folder, for the Drive Browser.
 *
 * **Server-only.** Uses the worker credential, because the Drive token lives in
 * a table no session can read.
 *
 * The rule this module exists to enforce: **a folder id supplied by the browser
 * is never trusted.** The Drive Browser takes a folder from the query string,
 * which means anybody who can open the page can type an id. Every listing
 * therefore re-proves that the requested folder descends from
 * `GOOGLE_DRIVE_ROOT_FOLDER_ID` before a single entry is returned.
 *
 * Without that, the browser would be a general-purpose Drive explorer wearing
 * this application's credentials.
 */

export interface BrowseResult {
  /** The folder actually listed — the root when the request was refused. */
  folderId: string;
  files: DriveFile[];
  nextPageToken: string | null;
  /** Why this is empty or fell back to the root, if it did. */
  problem: string | null;
  connected: boolean;
  rootFolderId: string | null;
}

const NOT_CONNECTED = (rootFolderId: string | null): BrowseResult => ({
  folderId: rootFolderId ?? "",
  files: [],
  nextPageToken: null,
  problem:
    "No Google Drive account is connected, so the media library cannot be read.",
  connected: false,
  rootFolderId,
});

export async function browseDrive(
  requestedFolderId?: string | null,
  pageToken?: string | null,
): Promise<BrowseResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { config, rootFolderId, problems } = resolveDriveConfig();

  if (!user) {
    return NOT_CONNECTED(rootFolderId);
  }

  if (config === null || rootFolderId === null) {
    return {
      folderId: rootFolderId ?? "",
      files: [],
      nextPageToken: null,
      problem: problems.join(" "),
      connected: false,
      rootFolderId,
    };
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return NOT_CONNECTED(rootFolderId);
  }

  const { data } = await client
    .from("social_accounts")
    .select("*")
    .eq("owner_id", user.id)
    .eq("platform", "google_drive")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();

  const account = (data as SocialAccount | null) ?? null;
  if (account === null) {
    return NOT_CONNECTED(rootFolderId);
  }

  const credential = await getLiveCredential(client, account);
  if (!credential.ok) {
    return {
      folderId: rootFolderId,
      files: [],
      nextPageToken: null,
      problem: credential.reason,
      connected: false,
      rootFolderId,
    };
  }

  const context: DriveRequestContext = {
    accessToken: credential.credential.accessToken,
  };

  // The boundary. A requested folder is proved to be inside the root before it
  // is listed; anything else falls back to the root rather than erroring, so a
  // stale link lands somewhere safe instead of nowhere.
  let folderId = rootFolderId;
  let problem: string | null = null;

  if (requestedFolderId && requestedFolderId !== rootFolderId) {
    const containment = await isInsideRoot(
      context,
      requestedFolderId,
      rootFolderId,
    );

    if (containment.inside) {
      folderId = requestedFolderId;
    } else {
      problem =
        "That folder is not inside the approved Precious Promises Content folder, so the root is shown instead.";
    }
  }

  try {
    const listing = await listFolder(context, folderId, pageToken ?? undefined);

    return {
      folderId,
      files: listing.files,
      nextPageToken: listing.nextPageToken,
      problem,
      connected: true,
      rootFolderId,
    };
  } catch {
    return {
      folderId,
      files: [],
      nextPageToken: null,
      problem: "Google Drive did not return that folder's contents.",
      connected: true,
      rootFolderId,
    };
  }
}

/** Which Drive files the owner has already imported, keyed by Drive id. */
export async function loadImportedFileIds(): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Set();
  }

  const { data } = await supabase
    .from("media_assets")
    .select("external_file_id")
    .eq("owner_id", user.id)
    .eq("storage_provider", "google_drive");

  return new Set(
    ((data ?? []) as { external_file_id: string | null }[])
      .map((row) => row.external_file_id)
      .filter((id): id is string => typeof id === "string"),
  );
}
