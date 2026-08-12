import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLiveCredential,
  markNeedsReconnect,
} from "@/lib/accounts/credentials";
import type { SocialAccount } from "@/lib/accounts/types";
import type { StorageMedia } from "@/lib/storage/provider";
import { createWorkerClient } from "@/lib/supabase/worker";

import { getFile, openFileStream, type DriveRequestContext } from "./api";
import { isFolder, mediaTypeForMime, safeFilename } from "./config";
import { fileIsInsideRoot } from "./root";
import { resolveDriveConfig } from "./server-config";
import { refuse, type DriveResult } from "./types";
import type { DriveFile } from "./types";

/**
 * The Google Drive storage adapter.
 *
 * This is what removes Stage 7's universal `media_source_unavailable`. It is a
 * real adapter: it authenticates, reads metadata, proves containment and
 * returns a streaming body. There is no stub in it.
 *
 * ## The order of checks, and why it is this order
 *
 * Containment is proved **before** any byte is read, and before the file is
 * assumed usable. The reverse order would mean a request for a file outside
 * the approved folder had already fetched it by the time it was refused —
 * which is the whole failure this boundary exists to prevent.
 *
 * 1. Configuration and connection exist.
 * 2. The file exists and is not in the bin.
 * 3. **It descends from the approved root.**
 * 4. It is a file, not a folder.
 * 5. Its type is one this product publishes.
 * 6. Drive reported a size, so an upload can declare a length.
 *
 * Only then are bytes opened.
 *
 * ## What this adapter cannot do
 *
 * It holds a read-only scope, so it cannot write, delete, or change sharing.
 * There is deliberately no function here that makes a file public or mints a
 * sharing link — a public Drive file to make publishing easier would be a
 * permanent exposure of Dave's media in exchange for a convenience.
 */

const PLATFORM = "google_drive" as const;

export class GoogleDriveStorageProvider {
  readonly provider = "google_drive" as const;

  /** Whether a Drive connection exists and is usable. */
  async isConnected(): Promise<boolean> {
    const { config } = resolveDriveConfig();
    if (config === null) {
      return false;
    }

    const { client } = createWorkerClient();
    if (client === null) {
      return false;
    }

    return (await findDriveAccount(client)) !== null;
  }

  /**
   * Resolve an asset's bytes, or say precisely why not.
   *
   * `ownerId` is required and filtered on: the worker credential bypasses RLS,
   * so ownership is proved explicitly here rather than assumed from the caller.
   */
  async open(
    externalFileId: string,
    ownerId: string,
  ): Promise<DriveResult<StorageMedia>> {
    const { config, rootFolderId } = resolveDriveConfig();
    if (config === null || rootFolderId === null) {
      return refuse("not_configured");
    }

    const { client } = createWorkerClient();
    if (client === null) {
      return refuse(
        "not_connected",
        "No trusted server credential is configured.",
      );
    }

    const account = await findDriveAccount(client, ownerId);
    if (account === null) {
      return refuse("not_connected");
    }

    const credential = await getLiveCredential(client, account);
    if (!credential.ok) {
      if (credential.needsReconnect) {
        await markNeedsReconnect(client, account.id, account.owner_id);
      }
      return refuse("not_connected", credential.reason);
    }

    const context: DriveRequestContext = {
      accessToken: credential.credential.accessToken,
    };

    let file;
    try {
      file = await getFile(context, externalFileId);
    } catch {
      return refuse("unreadable");
    }

    if (file === null) {
      return refuse("not_found");
    }
    if (file.trashed) {
      return refuse("trashed");
    }

    // The boundary. Before anything is read.
    const containment = await fileIsInsideRoot(context, file, rootFolderId);
    if (!containment.inside) {
      return refuse(
        "outside_root",
        `The containment check returned ${containment.reason}.`,
      );
    }

    if (isFolder(file.mimeType)) {
      return refuse("is_folder");
    }

    if (mediaTypeForMime(file.mimeType) === null) {
      return refuse("unsupported_type", `Its type is ${file.mimeType}.`);
    }

    if (file.sizeBytes === null || file.sizeBytes <= 0) {
      // An upload has to declare a length up front. A file whose size Drive
      // will not report cannot be uploaded honestly.
      return refuse("no_size");
    }

    const contentLength = file.sizeBytes;
    const contentType = file.mimeType;
    const filename = safeFilename(file.name);

    return {
      ok: true,
      value: {
        contentType,
        contentLength,
        filename,
        // Opened lazily, and re-authenticated at the moment of use: a token
        // captured here could have expired between resolution and upload.
        open: async () => {
          const fresh = await getLiveCredential(client, account);
          if (!fresh.ok) {
            throw new Error("The Drive authorisation is no longer usable.");
          }
          return openFileStream(
            { accessToken: fresh.credential.accessToken },
            externalFileId,
          );
        },
        // One inclusive slice, for platforms that upload in chunks. Each range
        // re-authenticates for the same reason `open` does: a chunked upload of
        // a large video can outlive the access token it started with.
        openRange: async (start: number, end: number) => {
          const fresh = await getLiveCredential(client, account);
          if (!fresh.ok) {
            throw new Error("The Drive authorisation is no longer usable.");
          }
          return openFileStream(
            { accessToken: fresh.credential.accessToken },
            externalFileId,
            { start, end },
          );
        },
      },
    };
  }

  /**
   * Metadata for one file, with containment proved.
   *
   * Used by the Drive Browser and by the import path. Returns the same
   * refusals as `open`, so the interface and the worker agree about why a file
   * is unusable.
   */
  async describe(
    externalFileId: string,
    ownerId: string,
  ): Promise<DriveResult<DriveFile>> {
    const { config, rootFolderId } = resolveDriveConfig();
    if (config === null || rootFolderId === null) {
      return refuse<DriveFile>("not_configured");
    }

    const { client } = createWorkerClient();
    if (client === null) {
      return refuse<DriveFile>("not_connected");
    }

    const account = await findDriveAccount(client, ownerId);
    if (account === null) {
      return refuse<DriveFile>("not_connected");
    }

    const credential = await getLiveCredential(client, account);
    if (!credential.ok) {
      return refuse<DriveFile>("not_connected", credential.reason);
    }

    const context: DriveRequestContext = {
      accessToken: credential.credential.accessToken,
    };

    let file;
    try {
      file = await getFile(context, externalFileId);
    } catch {
      return refuse<DriveFile>("unreadable");
    }

    if (file === null) {
      return refuse<DriveFile>("not_found");
    }

    const containment = await fileIsInsideRoot(context, file, rootFolderId);
    if (!containment.inside) {
      return refuse<DriveFile>("outside_root");
    }

    return { ok: true as const, value: file };
  }
}

/** The Drive account row, optionally scoped to one owner. */
async function findDriveAccount(
  client: SupabaseClient,
  ownerId?: string,
): Promise<SocialAccount | null> {
  let query = client
    .from("social_accounts")
    .select("*")
    .eq("platform", PLATFORM)
    .eq("status", "connected")
    .limit(1);

  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const { data } = await query.maybeSingle();
  return (data as SocialAccount | null) ?? null;
}

export const driveStorage = new GoogleDriveStorageProvider();
