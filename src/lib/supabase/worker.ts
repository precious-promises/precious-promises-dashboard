import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env/server";
import { publicEnv } from "@/lib/env/public";

/**
 * The Supabase client for background work.
 *
 * A worker has no browser and no user session, so it cannot use the
 * cookie-backed client every other part of this application uses. It needs a
 * trusted server credential instead.
 *
 * That credential is `SUPABASE_SECRET_KEY` — Supabase's current secret key
 * form (`sb_secret_…`), which replaces the legacy service role key. Three
 * things make it the right choice rather than merely the available one: it is
 * independently rotatable, it is instantly revocable, and Supabase refuses it
 * from a browser origin, which the legacy JWT could not do.
 *
 * **It bypasses Row Level Security.** Every query issued through this client
 * must therefore filter by `owner_id` itself. The worker is trusted to be
 * careful in a way the application code is deliberately not.
 *
 * The client is created lazily, inside a function, so importing this module
 * costs nothing and `next build` never needs the credential. If the key is
 * absent — which it is in CI, in tests and on any developer machine that has
 * not set it — this returns `null` and the caller reports that the worker is
 * not configured. It does not throw, and it does not fall back to a weaker
 * credential.
 */

export interface WorkerClientResult {
  client: SupabaseClient | null;
  /** Why there is no client, for display. Never names the value. */
  reason: string | null;
}

export function createWorkerClient(): WorkerClientResult {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv;
  const { SUPABASE_SECRET_KEY } = getServerEnv();

  if (!NEXT_PUBLIC_SUPABASE_URL) {
    return { client: null, reason: "The Supabase URL is not configured." };
  }

  if (!SUPABASE_SECRET_KEY) {
    return {
      client: null,
      reason:
        "No trusted worker credential is configured, so background publishing cannot run.",
    };
  }

  return {
    client: createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        // A worker has no session to persist and nothing to refresh.
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
    reason: null,
  };
}

/** Whether background publishing could run at all. */
export function isWorkerConfigured(): boolean {
  return createWorkerClient().client !== null;
}
