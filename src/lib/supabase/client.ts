import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for browser (Client Component) use.
 *
 * Built lazily inside the function rather than at module scope: a module-level
 * client would be constructed during prerendering, which would make
 * `next build` fail on machines that have no Supabase configuration.
 *
 * Only the publishable key reaches this client. Access is constrained by Row
 * Level Security, not by keeping the key secret.
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
