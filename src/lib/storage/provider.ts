import type { StorageProvider } from "@/lib/media/types";

/**
 * Storage abstraction for large media.
 *
 * **No implementation exists.** This is the seam Google Drive will slot into,
 * declared now so the media data model is not shaped around one vendor.
 *
 * Deliberately an interface with no concrete class behind it: a stub that
 * returned plausible values would be indistinguishable from a working
 * integration at the call site, and that is exactly the failure the project
 * rules forbid. Code that needs storage today does not compile against a fake —
 * it does not exist yet.
 */
export interface StorageAdapter {
  readonly provider: StorageProvider;

  /** Whether credentials are configured for this provider. */
  isConnected(): Promise<boolean>;

  /** A time-limited URL for viewing an asset. */
  getViewUrl(externalFileId: string): Promise<string>;
}

/**
 * Connection state for a provider, for display only.
 *
 * Every provider is unconnected in Stage 2. This is a fact about the system,
 * not a placeholder: no OAuth flow exists and no credential is stored.
 */
export interface StorageProviderStatus {
  provider: StorageProvider;
  connected: false;
  detail: string;
}

export const STORAGE_PROVIDER_STATUS: readonly StorageProviderStatus[] = [
  {
    provider: "google_drive",
    connected: false,
    detail: "Planned primary library for large media. Integration not built.",
  },
  {
    provider: "supabase_storage",
    connected: false,
    detail: "Available for small development assets. Not configured.",
  },
  {
    provider: "external",
    connected: false,
    detail: "Reference a file held elsewhere by URL.",
  },
] as const;
