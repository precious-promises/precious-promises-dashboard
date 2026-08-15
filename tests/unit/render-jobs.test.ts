import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canTransitionRender,
  clearRenderProvider,
  describeRenderCapability,
  getRenderProvider,
  isTerminalRenderStatus,
  NO_PROVIDER_REASON,
  RENDER_STATUSES,
  registerRenderProvider,
  requestRender,
  TERMINAL_RENDER_STATUSES,
  type RenderStatus,
} from "@/lib/video/render";

/**
 * Rendering honesty.
 *
 * The project rule these protect: **a path that did not genuinely produce
 * something must report failure.** For publishing that means never marking a
 * post as published; for rendering it means never producing a job that claims
 * a video exists when none does.
 */

// The registered provider resolves its config through the validated server
// environment, which requires APP_URL.
process.env.APP_URL ||= "http://localhost:3000";

describe("render status vocabulary", () => {
  it("is exactly the five approved statuses", () => {
    expect([...RENDER_STATUSES]).toEqual([
      "queued",
      "rendering",
      "completed",
      "failed",
      "cancelled",
    ]);
  });

  it("marks completed, failed and cancelled as terminal", () => {
    expect([...TERMINAL_RENDER_STATUSES]).toEqual([
      "completed",
      "failed",
      "cancelled",
    ]);
    expect(isTerminalRenderStatus("queued")).toBe(false);
    expect(isTerminalRenderStatus("rendering")).toBe(false);
  });
});

describe("render state machine", () => {
  it("only reaches completed from rendering", () => {
    // The important edge. A job that was never picked up by a worker cannot
    // jump to completed, so a request nothing acted on cannot be written down
    // as a finished render.
    for (const from of RENDER_STATUSES) {
      expect(
        canTransitionRender(from, "completed"),
        `${from} → completed`,
      ).toBe(from === "rendering");
    }
  });

  it("allows a queued job to start, fail or be cancelled", () => {
    expect(canTransitionRender("queued", "rendering")).toBe(true);
    expect(canTransitionRender("queued", "failed")).toBe(true);
    expect(canTransitionRender("queued", "cancelled")).toBe(true);
  });

  it("lets nothing leave a terminal status", () => {
    for (const from of TERMINAL_RENDER_STATUSES) {
      for (const to of RENDER_STATUSES) {
        expect(canTransitionRender(from, to), `${from} → ${to}`).toBe(false);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const status of RENDER_STATUSES) {
      expect(canTransitionRender(status, status)).toBe(false);
    }
  });

  it("cannot go backwards from rendering to queued", () => {
    expect(canTransitionRender("rendering", "queued")).toBe(false);
  });
});

describe("an unregistered runtime has no provider", () => {
  // Stage 11 made the provider a registry rather than a hard-coded null: the
  // Remotion worker registers itself from a server-only module, so a browser
  // bundle — which never imports it — still gets exactly this behaviour.
  it("returns null rather than a stub", () => {
    // A stub returning plausible values would be indistinguishable from a
    // working renderer at the call site. Callers must handle the absence.
    expect(getRenderProvider()).toBeNull();
  });

  it("reports itself as not connected", () => {
    const capability = describeRenderCapability();

    expect(capability.connected).toBe(false);
    expect(capability.providerId).toBe("none");
    expect(capability.detail).toMatch(/not deployed/i);
  });

  it("refuses a render request and says why", async () => {
    const outcome = await requestRender({
      project: { id: "p1", name: "A project", current_revision: 3 },
      aspectRatio: "9:16",
      scenes: [],
    });

    expect(outcome.accepted).toBe(false);
    if (!outcome.accepted) {
      expect(outcome.reason).toBe(NO_PROVIDER_REASON);
      expect(outcome.reason).toMatch(/nothing was rendered/i);
    }
  });

  it("never reports acceptance, whatever the composition", async () => {
    for (const aspectRatio of ["9:16", "16:9", "1:1"] as const) {
      const outcome = await requestRender({
        project: { id: "p1", name: "A project", current_revision: 1 },
        aspectRatio,
        scenes: [],
      });

      expect(outcome.accepted).toBe(false);
    }
  });
});

describe("the registered Remotion provider", () => {
  beforeAll(async () => {
    // Importing the server-only module registers the provider, exactly as the
    // server actions do.
    await import("@/lib/render/register");
  });

  afterAll(() => {
    clearRenderProvider();
  });

  it("is returned by the registry once registered", () => {
    const provider = getRenderProvider();
    expect(provider).not.toBeNull();
    expect(provider?.id).toBe("remotion_worker");
  });

  it("still refuses to accept when the runtime is not enabled", async () => {
    // RENDER_ENABLED and the worker credential are unset in tests, so even a
    // registered provider must refuse — implemented is not enabled.
    const outcome = await requestRender({
      project: { id: "p1", name: "A project", current_revision: 2 },
      aspectRatio: "9:16",
      scenes: [],
    });

    expect(outcome.accepted).toBe(false);
    if (!outcome.accepted) {
      expect(outcome.reason).not.toBe("");
    }
  });
});

describe("the provider registry", () => {
  it("can be cleared back to the honest null", async () => {
    registerRenderProvider(() => ({
      id: "remotion_worker",
      isConnected: async () => false,
      submit: async () => ({ accepted: false, reason: "test" }),
    }));
    expect(getRenderProvider()).not.toBeNull();

    clearRenderProvider();
    expect(getRenderProvider()).toBeNull();
    expect(describeRenderCapability().connected).toBe(false);
  });
});

describe("the database refuses a fabricated success", () => {
  const MIGRATION = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260808200000_create_video_studio.sql",
    ),
    "utf8",
  );

  it("requires an output file before a job may be completed", () => {
    expect(MIGRATION).toMatch(
      /render_jobs_completed_requires_output[\s\S]*?status <> 'completed' or output_media_asset_id is not null/,
    );
  });

  it("requires a reason before a job may be failed", () => {
    expect(MIGRATION).toMatch(
      /render_jobs_failed_requires_reason[\s\S]*?status <> 'failed' or failure_reason is not null/,
    );
  });

  it("forbids the 'none' provider from completing anything", () => {
    expect(MIGRATION).toMatch(
      /render_jobs_none_provider_cannot_complete[\s\S]*?provider <> 'none' or status <> 'completed'/,
    );
  });
});

describe("the render request path writes a failure, not a queue entry", () => {
  const ACTIONS = readFileSync(
    join(process.cwd(), "src/app/dashboard/video/actions.ts"),
    "utf8",
  );

  it("derives the stored status from the provider's answer", () => {
    // Not a literal 'completed' anywhere: the status comes from whether the
    // provider accepted, and no provider exists.
    expect(ACTIONS).toMatch(/outcome\.accepted \? "queued" : "failed"/);
    expect(ACTIONS).not.toMatch(/status: "completed"/);
  });

  it("records the refusal reason with the job", () => {
    expect(ACTIONS).toMatch(
      /failure_reason: outcome\.accepted \? null : outcome\.reason/,
    );
  });
});

/** A small guard against a status quietly appearing without a transition. */
describe("every status is reachable or explicitly terminal", () => {
  it("has an entry in the transition table for each status", () => {
    for (const status of RENDER_STATUSES) {
      expect(() =>
        canTransitionRender(status, "failed" as RenderStatus),
      ).not.toThrow();
    }
  });
});
