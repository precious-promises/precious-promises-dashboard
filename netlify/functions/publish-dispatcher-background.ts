import { createHash, timingSafeEqual } from "node:crypto";

import { runPublishDispatcher } from "../../src/lib/publishing/worker";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function expectedKey(): string | null {
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!secret) return null;
  return createHash("sha256")
    .update(`${secret}:publish-dispatcher`)
    .digest("hex");
}

function authorised(request: Request): boolean {
  const expected = expectedKey();
  const supplied = request.headers.get("x-pp-internal-key");
  if (!expected || !supplied || expected.length !== supplied.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function exposeWorkerEnvironment() {
  const url = Netlify.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");

  if (url && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
  if (secret && !process.env.SUPABASE_SECRET_KEY) {
    process.env.SUPABASE_SECRET_KEY = secret;
  }
}

export default async (request: Request) => {
  if (!authorised(request)) {
    console.log("Publishing background invocation refused.");
    return;
  }

  exposeWorkerEnvironment();
  const result = await runPublishDispatcher(new Date());
  console.log("Scheduled publishing pass", {
    configured: result.configured,
    claimed: result.claimed,
    blocked: result.blocked,
    failed: result.failed,
    posted: result.posted,
    incomplete: result.incomplete,
    reason: result.reason,
  });
};

export const config = {
  background: true,
  method: "POST",
};
