import { createClient } from "@supabase/supabase-js";

import { syncAllAnalytics } from "../../src/lib/analytics/sync";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function exposeWorkerEnvironment() {
  const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");

  if (url && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
  if (secret && !process.env.SUPABASE_SECRET_KEY) {
    process.env.SUPABASE_SECRET_KEY = secret;
  }

  if (!url || !secret) return null;

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async () => {
  const client = exposeWorkerEnvironment();

  if (!client) {
    console.log("Analytics sync skipped: trusted worker configuration is incomplete.");
    return;
  }

  const { data } = await client
    .from("social_accounts")
    .select("owner_id, platform")
    .eq("status", "connected")
    .in("platform", ["youtube", "instagram"]);

  const owners = [
    ...new Set(((data ?? []) as { owner_id: string }[]).map((row) => row.owner_id)),
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
  schedule: "15 5 * * *",
};
