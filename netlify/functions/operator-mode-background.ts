import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { runOperatorForEnabledOwners } from "../../src/lib/automation/operator";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function expectedKey(): string | null {
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:operator-mode`).digest("hex");
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
    console.log("Operator Mode background invocation refused.");
    return;
  }

  const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!url || !secret) {
    console.log(
      "Operator Mode skipped: trusted worker configuration is incomplete.",
    );
    return;
  }

  const client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const result = await runOperatorForEnabledOwners(client);
  console.log("Operator Mode scheduled pass", result);
};

export const config = {
  background: true,
  method: "POST",
};
