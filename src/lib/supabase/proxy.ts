import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { resolveAuthRedirect } from "@/lib/auth/routes";

import { getSupabaseConfig } from "./config";

/**
 * Refresh the Supabase session and apply route protection.
 *
 * Runs on every matched request via src/proxy.ts. Two jobs:
 *
 * 1. Refresh the auth cookies, so a session does not expire mid-visit.
 * 2. Redirect according to the rules in `src/lib/auth/routes.ts`.
 *
 * If Supabase is not configured, this passes the request through untouched
 * rather than failing every route. The protected pages themselves still
 * refuse to render without a session, so this cannot open a hole — it just
 * keeps the public site working on an unconfigured checkout.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  let config;
  try {
    config = getSupabaseConfig();
  } catch {
    return supabaseResponse;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
        // These are the no-store headers Supabase supplies alongside auth
        // cookies. They must be applied, or a CDN could cache a response
        // carrying one user's session cookie and serve it to another.
        for (const [key, headerValue] of Object.entries(headers)) {
          supabaseResponse.headers.set(key, headerValue);
        }
      },
    },
  });

  // Do not put code between createServerClient and getUser(). getUser()
  // revalidates the token with Supabase; anything that short-circuits it can
  // cause sessions to be dropped in ways that are very hard to debug.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = resolveAuthRedirect(
    request.nextUrl.pathname,
    user !== null,
  );

  if (redirectTo !== null) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    // Carry over any refreshed auth cookies, otherwise the redirect discards
    // the newly issued session and the browser falls out of sync.
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  // Must be returned as-is. Building a fresh response here without copying the
  // cookies over would terminate the user's session prematurely.
  return supabaseResponse;
}
