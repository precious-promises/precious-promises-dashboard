import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseConfig } from "./config";

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 *
 * Never import this from a Client Component — it reads `next/headers`, which
 * only exists on the server.
 *
 * This uses the publishable key, exactly like the browser client. It is *not*
 * a privileged client: every query it makes is still subject to Row Level
 * Security and the caller's session. The service role key is not used anywhere
 * in this application.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is expected and safe to
          // ignore here: the proxy in src/proxy.ts refreshes the session on
          // every request, so the refreshed cookies still reach the browser.
        }
      },
    },
  });
}
