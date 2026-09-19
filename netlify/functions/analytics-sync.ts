import { createHash } from "node:crypto";

declare const Netlify: {
  env: { get(name: string): string | undefined };
};

function internalKey(label: string): string | null {
  const secret = Netlify.env.get("SUPABASE_SECRET_KEY");
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:${label}`).digest("hex");
}

export default async (request: Request) => {
  const key = internalKey("analytics-sync");
  if (!key) {
    console.log("Analytics skipped: trusted worker configuration is incomplete.");
    return;
  }

  const target = new URL(
    "/.netlify/functions/analytics-sync-background",
    request.url,
  );
  const response = await fetch(target, {
    method: "POST",
    headers: { "x-pp-internal-key": key },
  });

  console.log("Analytics background handoff", { accepted: response.status === 202 });
};

export const config = {
  schedule: "15 5 * * *",
};
