import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`. The export
 * must be named `proxy` (or be the default export); `middleware.ts` is
 * deprecated in this version.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image optimisation. `/api/health`
     * is intentionally included so the session refresh runs uniformly — the
     * route itself stays public, because route policy lives in
     * src/lib/auth/routes.ts rather than in this matcher.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
