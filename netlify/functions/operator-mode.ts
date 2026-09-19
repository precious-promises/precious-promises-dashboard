import { createClient } from "@supabase/supabase-js";

import { runOperatorForEnabledOwners } from "../../src/lib/automation/operator";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function workerClient() {
  const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");

  if (!url || !secret) return null;

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async () => {
  const client = workerClient();

  if (!client) {
    console.log("Operator Mode skipped: trusted worker configuration is incomplete.");
    return;
  }

  const result = await runOperatorForEnabledOwners(client);
  console.log("Operator Mode scheduled pass", result);
};

export const config = {
  schedule: "0 */6 * * *",
};
