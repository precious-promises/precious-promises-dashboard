import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { syncAllAnalytics } from "../../src/lib/analytics/sync";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function expectedKey(): string | null {
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:analytics-sync`).digest("hex");
}

function authorised(request: Request): boolean {
  const expected = expectedKey();
  const supplied = request.headers.get("x-pp-internal-key");
  if (!expected || !supplied || expected.length !== supplied.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export default async (request: Request) => {
  if (!authorised(request)) {
    console.log("Analytics background invocation refused.");
    return;
  }

  const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!url || !secret) {
    console.log(
      "Analytics sync skipped: trusted worker configuration is incomplete.",
    );
    return;
  }

  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await client
    .from("social_accounts")
    .select("owner_id, platform")
    .eq("status", "connected")
    .in("platform", ["youtube", "instagram"]);

  const owners = [
    ...new Set(
      ((data ?? []) as { owner_id: string }[]).map((row) => row.owner_id),
    ),
  ];

  const results = [];
  for (const ownerId of owners) {
    results.push(
      ...(await syncAllAnalytics({
        ownerId,
        triggerSource: "scheduled",
      })),
    );
  }

  console.log("Scheduled analytics pass", {
    owners: owners.length,
    platforms: results.map((result) => ({
      platform: result.platform,
      ok: result.ok,
      snapshotsWritten: result.snapshotsWritten,
      postsConsidered: result.postsConsidered,
      errorCategory: result.errorCategory,
    })),
  });
};

export const config = {
  background: true,
  method: "POST",
};
