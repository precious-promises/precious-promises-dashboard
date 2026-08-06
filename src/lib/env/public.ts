import { parsePublicEnv, type PublicEnv } from "./schema";

/**
 * Client-safe environment values.
 *
 * Every variable here is inlined into the browser bundle at build time, so
 * this module must only ever reference `NEXT_PUBLIC_*` keys. Never re-export
 * anything from `./server` here.
 *
 * The keys are written out as literal `process.env.X` member accesses on
 * purpose: Next.js replaces those statically during the build, and dynamic
 * lookups such as `process.env[name]` would come back undefined in the
 * browser.
 */
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
