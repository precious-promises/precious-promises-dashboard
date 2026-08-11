import type { StorageProvider } from "@/lib/media/types";

/**
 * Storage abstraction for large media.
 *
 * Stage 2 declared this seam with no implementation behind it, deliberately:
 * a stub returning plausible values would have been indistinguishable from a
 * working integration at the call site.
 *
 * **Stage 8 filled it in for Google Drive.** `GoogleDriveStorageProvider` in
 * `src/lib/drive/storage.ts` is the first real implementation, and it is what
 * unblocks the YouTube upload path. Supabase Storage and external references
 * still have no adapter, and code asking for one still gets an honest refusal
 * rather than a fake.
 */

/**
 * A resolved, readable file.
 *
 * `open()` returns a `Response` so the body can be streamed. A video may be
 * hundreds of megabytes; buffering one into memory to hand it to an upload
 * would work on a developer machine and fall over on a worker.
 */
export interface StorageMedia {
  contentType: string;
  contentLength: number;
  filename: string;
  open(): Promise<Response>;
}

export interface StorageAdapter {
  readonly provider: StorageProvider;

  /** Whether credentials and a connection exist for this provider. */
  isConnected(): Promise<boolean>;

  /**
   * Resolve an asset's bytes, or explain why not.
   *
   * Returns `null` rather than throwing when the file cannot be used, so a
   * caller cannot forget to handle the refusal.
   */
  openMedia(externalFileId: string, ownerId: string): Promise<StorageMedia>;
}

/**
 * Connection state for a provider, for display.
 *
 * `connected` is a fact checked at runtime, not a constant — Drive is
 * implemented but is only connected once Dave has authorised it.
 */
export interface StorageProviderStatus {
  provider: StorageProvider;
  implemented: boolean;
  detail: string;
}

export const STORAGE_PROVIDER_STATUS: readonly StorageProviderStatus[] = [
  {
    provider: "google_drive",
    implemented: true,
    detail:
      "Implemented in Stage 8. Reads metadata and bytes from the approved Precious Promises Content folder, and refuses anything outside it.",
  },
  {
    provider: "supabase_storage",
    implemented: false,
    detail: "No adapter. Available for small development assets in future.",
  },
  {
    provider: "external",
    implemented: false,
    detail:
      "A reference to a file held elsewhere. Nothing fetches external URLs — doing so would be an arbitrary URL fetcher, which this application will not have.",
  },
] as const;

export function storageStatusFor(
  provider: StorageProvider,
): StorageProviderStatus {
  return (
    STORAGE_PROVIDER_STATUS.find((status) => status.provider === provider) ?? {
      provider,
      implemented: false,
      detail: "No adapter for this provider.",
    }
  );
}
