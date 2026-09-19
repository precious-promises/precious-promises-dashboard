import { runPublishDispatcher } from "../../src/lib/publishing/worker";

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
}

export default async () => {
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
  schedule: "*/5 * * * *",
};
