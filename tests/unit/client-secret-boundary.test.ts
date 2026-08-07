// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Architectural guard on the server/client boundary.
 *
 * These assertions read the source tree rather than exercising behaviour,
 * because the failure they prevent — a secret compiled into the browser
 * bundle — cannot be caught by a runtime test after the fact. A build that
 * leaks a service role key is already a build that shipped it.
 */

const SRC_ROOT = fileURLToPath(new URL("../../src", import.meta.url));

/** Variables that must never appear in code reachable from the browser. */
const SERVER_ONLY_VARIABLES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOKEN_ENCRYPTION_KEY",
  "AI_API_KEY",
  "TRIGGER_SECRET_KEY",
  "META_APP_SECRET",
  "TIKTOK_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "ELEVENLABS_API_KEY",
] as const;

/** Modules that only work on the server. */
const SERVER_ONLY_IMPORTS = [
  "next/headers",
  "@/lib/env/server",
  "@/lib/supabase/server",
  "./server",
  "../env/server",
] as const;

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.(ts|tsx)$/.test(entry))
    .map((entry) => join(SRC_ROOT, entry));
}

/**
 * Remove comments so prose about a variable is not mistaken for a use of it.
 *
 * Block comments go entirely; for line comments only whole-line ones are
 * dropped, so a `https://…` inside real code survives intact.
 */
function stripComments(contents: string): string {
  return contents
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

function read(relativePath: string): string {
  return stripComments(readFileSync(join(SRC_ROOT, relativePath), "utf8"));
}

function isClientComponent(contents: string): boolean {
  return /^\s*(["'])use client\1/m.test(contents);
}

describe("the client-safe env module", () => {
  const contents = read("lib/env/public.ts");

  it("exposes only NEXT_PUBLIC_ variables", () => {
    const referenced = [
      ...contents.matchAll(/process\.env\.([A-Z0-9_]+)/g),
    ].map((match) => match[1]);

    expect(referenced.length).toBeGreaterThan(0);
    for (const variable of referenced) {
      expect(variable).toMatch(/^NEXT_PUBLIC_/);
    }
  });

  it("does not re-export the server module", () => {
    expect(contents).not.toMatch(/from\s+["']\.\/server["']/);
    expect(contents).not.toMatch(/export\s+\*\s+from/);
  });
});

describe("the Supabase browser client", () => {
  const contents = read("lib/supabase/client.ts");

  it("does not import server-only modules", () => {
    for (const specifier of SERVER_ONLY_IMPORTS) {
      expect(contents).not.toContain(`"${specifier}"`);
    }
  });

  it("does not reference the service role key", () => {
    expect(contents).not.toContain("SERVICE_ROLE");
  });
});

describe("the source tree", () => {
  it("never references the service role key anywhere", () => {
    // Block 3 uses the publishable key exclusively. The service role key
    // bypasses RLS and has no place in application code.
    for (const file of sourceFiles()) {
      expect(stripComments(readFileSync(file, "utf8"))).not.toContain(
        "process.env.SUPABASE_SERVICE_ROLE_KEY",
      );
    }
  });

  it("keeps server-only variables out of every client component", () => {
    for (const file of sourceFiles()) {
      const contents = stripComments(readFileSync(file, "utf8"));
      if (!isClientComponent(contents)) {
        continue;
      }

      for (const variable of SERVER_ONLY_VARIABLES) {
        expect(contents, `${file} is a client component`).not.toContain(
          variable,
        );
      }
    }
  });

  it("keeps server-only imports out of every client component", () => {
    for (const file of sourceFiles()) {
      const contents = stripComments(readFileSync(file, "utf8"));
      if (!isClientComponent(contents)) {
        continue;
      }

      for (const specifier of SERVER_ONLY_IMPORTS) {
        expect(contents, `${file} is a client component`).not.toContain(
          `"${specifier}"`,
        );
      }
    }
  });

  it("finds client components to check, so the guard is not vacuous", () => {
    const clientComponents = sourceFiles().filter((file) =>
      isClientComponent(stripComments(readFileSync(file, "utf8"))),
    );

    expect(clientComponents.length).toBeGreaterThan(0);
  });
});
