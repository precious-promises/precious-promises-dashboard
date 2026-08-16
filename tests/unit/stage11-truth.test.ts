// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isRetryableRenderFailure,
  RENDER_FAILURE_CATEGORIES,
  RETRYABLE_RENDER_FAILURES,
} from "@/lib/render/worker";

/**
 * The Stage 11 truth pass, pinned.
 *
 * Copy that says "no publishing integration exists" was true through Stage 5
 * and became a lie the moment Stage 6–9 shipped. These tests keep the whole
 * interface tree from ever reverting to it, and pin the render worker's
 * honesty vocabulary alongside.
 */

const SRC_ROOT = join(process.cwd(), "src");

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => join(SRC_ROOT, entry));
}

describe("no page claims publishing does not exist", () => {
  it("has removed every 'no publishing integration exists' claim", () => {
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      expect(contents, file).not.toMatch(
        /no publishing (integration )?exists/i,
      );
      expect(contents, file).not.toMatch(/[Nn]othing sends (it|them)\b/);
    }
  });

  it("keeps the platform rows reading from stored accounts, not hardcoded", () => {
    const platformStatus = readFileSync(
      join(SRC_ROOT, "components/dashboard/platform-status.tsx"),
      "utf8",
    );
    expect(platformStatus).toMatch(/status:\s*AccountStatus \| null/);
    expect(platformStatus).toMatch(/ACCOUNT_STATUS_LABELS/);
  });

  it("counts Published This Week from genuinely posted records", () => {
    const dashboard = readFileSync(
      join(SRC_ROOT, "app/dashboard/page.tsx"),
      "utf8",
    );
    expect(dashboard).toMatch(/status === ["']posted["']/);
    expect(dashboard).toMatch(/posted_at/);
    expect(dashboard).not.toContain("No platform is connected");
  });
});

describe("implemented, connected and live-verified stay distinct", () => {
  it("says on the settings page that code existing is not connection", () => {
    const settings = readFileSync(
      join(SRC_ROOT, "app/dashboard/settings/page.tsx"),
      "utf8",
    );
    expect(settings).toMatch(
      /Code existing does not mean connected; connected does not mean live-verified/i,
    );
  });

  it("keeps the foundation board honest about what it describes", () => {
    const dashboard = readFileSync(
      join(SRC_ROOT, "app/dashboard/page.tsx"),
      "utf8",
    );
    expect(dashboard).toMatch(/Implemented is not connected/i);
  });
});

describe("the YouTube workspace claims nothing the API does not provide", () => {
  it("declines to classify Shorts and says why", () => {
    const page = readFileSync(
      join(SRC_ROOT, "app/dashboard/youtube/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/Shorts classification is decided by YouTube/i);
    expect(page).toMatch(/does not claim it/i);
    // No invented classifier anywhere in the page.
    expect(page).not.toMatch(/isShort\s*[:=(]/);
  });

  it("lists only uploads this dashboard recorded", () => {
    const page = readFileSync(
      join(SRC_ROOT, "app/dashboard/youtube/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/this dashboard/i);
  });
});

describe("render failure vocabulary", () => {
  it("names each way a render can genuinely fail", () => {
    expect([...RENDER_FAILURE_CATEGORIES]).toEqual([
      "not_configured",
      "invalid_composition",
      "storage_error",
      "render_error",
      "worker_crashed",
      "transient",
    ]);
  });

  it("marks only categories where repeating could differ as retryable", () => {
    expect([...RETRYABLE_RENDER_FAILURES]).toEqual([
      "storage_error",
      "transient",
      "worker_crashed",
    ]);
    // A broken composition renders broken every time.
    expect(isRetryableRenderFailure("invalid_composition")).toBe(false);
    expect(isRetryableRenderFailure("not_configured")).toBe(false);
  });

  it("records the deterministic output path at claim time for crash recovery", () => {
    const worker = readFileSync(
      join(process.cwd(), "src/lib/render/worker.ts"),
      "utf8",
    );
    expect(worker).toMatch(/output_storage_path/);
    expect(worker).toMatch(/reconcile/i);
  });

  it("constrains voice and render jobs against fabricated success in SQL", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260815090000_create_production_automation.sql",
      ),
      "utf8",
    );
    // A completed voice job must have output; a failed one must say why.
    expect(migration).toMatch(/voice_jobs[\s\S]*?completed[\s\S]*?output/i);
    expect(migration).toMatch(/failure_category/);
    // Render jobs gained the claim/reconcile columns.
    expect(migration).toMatch(/output_storage_path/);
    expect(migration).toMatch(/claimed_at/);
  });
});
