import { task } from "@trigger.dev/sdk";

import { createWorkerClient } from "@/lib/supabase/worker";
import {
  processQueuedRenderJobs,
  reconcileRenderJob,
  runRenderJob,
} from "@/lib/render/worker";
import "@/lib/render/register";

/**
 * Background rendering tasks.
 *
 * **Implemented, not connected, not running** — the same standing as every
 * other Trigger.dev task in this repository: no project is configured, so
 * nothing is deployed and nothing runs. The dashboard's render path calls
 * the same orchestration directly, and says "Implemented, not running"
 * rather than implying a worker fleet that does not exist.
 *
 * Rendering is the long-running work this product has; when a Trigger.dev
 * project is eventually connected, these tasks are where it belongs.
 */

export interface RenderJobPayload {
  renderJobId: string;
}

export const renderVideoJob = task({
  id: "render-video-job",
  // Rendering a long composition is slow by nature. Ten minutes matches the
  // project ceiling in trigger.config.ts.
  maxDuration: 600,
  run: async (payload: RenderJobPayload) => {
    const { client, reason } = createWorkerClient();
    if (client === null) {
      return { ok: false, reason };
    }

    const result = await runRenderJob(client, payload.renderJobId);
    // Identifiers and outcomes only — no props, no URLs, no content.
    return {
      ok: result.outcome === "completed",
      outcome: result.outcome,
      failureCategory: result.failureCategory,
    };
  },
});

export const renderQueueSweep = task({
  id: "render-queue-sweep",
  maxDuration: 600,
  run: async () => {
    const { client, reason } = createWorkerClient();
    if (client === null) {
      return { processed: 0, reason };
    }

    const results = await processQueuedRenderJobs(client);
    return {
      processed: results.length,
      completed: results.filter((entry) => entry.outcome === "completed")
        .length,
      failed: results.filter((entry) => entry.outcome === "failed").length,
    };
  },
});

export interface RenderReconcilePayload {
  renderJobId: string;
}

export const renderReconcile = task({
  id: "render-reconcile",
  maxDuration: 120,
  run: async (payload: RenderReconcilePayload) => {
    const { client, reason } = createWorkerClient();
    if (client === null) {
      return { ok: false, reason };
    }

    const result = await reconcileRenderJob(client, payload.renderJobId);
    return { ok: result.outcome !== "skipped", outcome: result.outcome };
  },
});
