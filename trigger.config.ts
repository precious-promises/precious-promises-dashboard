import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev configuration.
 *
 * The project reference is not a secret — it identifies a project, it does not
 * authorise anything — so it lives here, read from `TRIGGER_PROJECT_REF` with
 * an obviously-unset fallback. The fallback matters: `next build`, `pnpm test`
 * and CI must all succeed on a machine that has never seen a Trigger.dev
 * credential, and they do.
 *
 * The credential itself (`TRIGGER_SECRET_KEY`) is only ever read by the
 * Trigger.dev CLI and the platform. Nothing in this repository reads it, and
 * nothing in a browser bundle can.
 *
 * **No project is connected.** Deploying these tasks needs an interactive
 * `npx trigger.dev@latest login` and a project created in the dashboard —
 * documented as a single manual step in
 * docs/stage-6-publishing-infrastructure.md. Until that happens the task code
 * exists and is type-checked, and nothing runs.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_not_configured",
  dirs: ["./src/trigger"],

  /**
   * A hard ceiling on any single run.
   *
   * Ten minutes matches the claim lease, so a run cannot outlive the claim it
   * is working under — the two would otherwise drift and a second worker could
   * pick up a post while the first was still sending.
   */
  maxDuration: 600,

  /**
   * Default retry policy.
   *
   * These are Trigger.dev's own transport-level retries, and they are
   * deliberately modest: a publish that fails for a reason worth retrying is
   * retried by the domain layer, which knows the difference between a timeout
   * and a rejected caption. Retrying a rejection here would just repeat it.
   *
   * No platform-specific counts appear anywhere — those depend on each
   * platform's published limits, which this codebase does not assert until it
   * has read them in that platform's current documentation.
   */
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
});
