// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MANUAL_RAW_NAME,
  MANUAL_SOURCE,
  parseManualEntry,
} from "@/lib/analytics/manual";
import { AUDIT_ACTIONS } from "@/lib/audit/types";
import {
  experimentReadiness,
  OBSERVATIONAL_NOTE,
} from "@/lib/growth/experiments";
import {
  describeProgress,
  measureGoal,
  unmeasurableGoal,
  type GrowthGoal,
} from "@/lib/growth/goals";
import { reading, unavailable } from "@/lib/analytics/types";
import { windowsDueFor } from "@/lib/analytics/sync";

/**
 * The Stage 10 write paths, and the guarantees around them.
 *
 * Two things carry most of the weight:
 *
 * 1. **Provenance cannot be forged.** A browser may record a figure it typed;
 *    it may never record one claiming to have come from a platform.
 * 2. **Intent is never rendered as measurement.** A goal with no reading behind
 *    it shows as unmeasured, not as 0%.
 */

const NOW = new Date("2026-08-12T12:00:00Z");

// ---------------------------------------------------------------------------
// Manual entry
// ---------------------------------------------------------------------------

function manualForm(overrides: Record<string, unknown> = {}) {
  return {
    platform: "tiktok",
    external_post_id: "7300000000000000000",
    scheduled_post_id: null,
    observation_window: "lifetime",
    observed_on: "2026-08-11",
    metric_name: "views_or_plays",
    metric_value: "1200",
    ...overrides,
  };
}

describe("manual analytics entry", () => {
  it("accepts a figure read off the platform", () => {
    const result = parseManualEntry(manualForm());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metric_value).toBe(1200);
      expect(result.data.platform).toBe("tiktok");
    }
  });

  it("rejects a negative figure", () => {
    // A negative view count is a typo, and it would poison every average it
    // later fell into.
    const result = parseManualEntry(manualForm({ metric_value: "-5" }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.metric_value).toMatch(/negative/i);
    }
  });

  it("accepts a genuine zero", () => {
    // Zero is a measurement. A post a person genuinely saw had no views is a
    // fact worth recording.
    const result = parseManualEntry(manualForm({ metric_value: "0" }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metric_value).toBe(0);
    }
  });

  it("requires the platform's own post id", () => {
    // A figure with no post attached could never be grouped, compared or
    // checked back against the platform.
    const result = parseManualEntry(manualForm({ external_post_id: "  " }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.external_post_id).toBeTruthy();
    }
  });

  it("requires the date the figure was read", () => {
    const result = parseManualEntry(manualForm({ observed_on: "yesterday" }));

    expect(result.success).toBe(false);
  });

  it("has no field through which a source could be supplied", () => {
    // The decisive check. The schema does not accept `source` at all, so a
    // caller cannot pass one — and the server fixes it to `manual`.
    const result = parseManualEntry(
      manualForm({ source: "instagram_api" } as Record<string, unknown>),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect("source" in result.data).toBe(false);
    }
  });

  it("fixes the source and raw name to manual", () => {
    expect(MANUAL_SOURCE).toBe("manual");
    expect(MANUAL_RAW_NAME).toMatch(/hand/i);
  });
});

describe("API provenance cannot be forged from a browser", () => {
  /**
   * The guarantee lives in the database, not in application code — so this
   * reads the migration. A policy is the only thing that survives a caller who
   * bypasses the form entirely.
   */
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260812120000_create_analytics_and_growth.sql",
    ),
    "utf8",
  );

  it("permits only manual inserts from an authenticated session", () => {
    expect(migration).toMatch(
      /create policy "Owners can record manual analytics only"[\s\S]*?with check \(\(select auth\.uid\(\)\) = owner_id and source = 'manual'\)/,
    );
  });

  it("permits only manual updates and deletes", () => {
    expect(migration).toMatch(
      /create policy "Owners can update their manual analytics only"[\s\S]*?source = 'manual'/,
    );
    expect(migration).toMatch(
      /create policy "Owners can delete their manual analytics only"[\s\S]*?source = 'manual'/,
    );
  });

  it("ties metric writes to a manual parent snapshot", () => {
    expect(migration).toMatch(
      /create policy "Owners can record metrics on manual snapshots"[\s\S]*?s\.source = 'manual'/,
    );
  });

  it("gives sync runs no write policy at all", () => {
    // A browser that could write a succeeded run could make stale data look
    // fresh, which is the one lie this stage exists to prevent.
    const syncPolicies = migration.match(
      /create policy "[^"]+" *\n?on public\.analytics_sync_runs for (\w+)/g,
    );

    expect(syncPolicies).not.toBeNull();
    for (const policy of syncPolicies ?? []) {
      expect(policy).toMatch(/for select/);
    }
  });

  it("keeps manual and API observations as separate rows", () => {
    // `source` is part of the unique index, so a manual entry can never
    // overwrite an API reading for the same post, window and day.
    expect(migration).toMatch(
      /create unique index[\s\S]*?analytics_snapshots_unique_observation[\s\S]*?source,/,
    );
  });
});

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

function goal(overrides: Partial<GrowthGoal> = {}): GrowthGoal {
  return {
    id: "goal-1",
    owner_id: "owner-1",
    name: "Twelve Shorts this quarter",
    metric: "views_or_plays",
    platform: null,
    target_value: 1000,
    period_start: "2026-08-01",
    period_end: "2026-10-31",
    status: "active",
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("goals are targets, never predictions", () => {
  it("reports unmeasured progress as unknown, not zero", () => {
    const progress = unmeasurableGoal(goal(), "not_yet_fetched", NOW);

    // The decisive assertion. 0% would tell Dave he had achieved nothing when
    // the truth is that nobody has looked.
    expect(progress.percent).toBeNull();
    expect(progress.percent).not.toBe(0);
    expect(describeProgress(progress)).toMatch(/not the same as no progress/i);
  });

  it("reports a genuine zero measurement as zero percent", () => {
    const progress = measureGoal(
      goal(),
      reading({
        metric: "views_or_plays",
        value: 0,
        source: "youtube_api",
        rawName: "views",
        observedAt: NOW.toISOString(),
        fetchedAt: NOW.toISOString(),
        window: "lifetime",
      }),
      NOW,
    );

    expect(progress.percent).toBe(0);
  });

  it("measures real progress against the target", () => {
    const progress = measureGoal(
      goal(),
      reading({
        metric: "views_or_plays",
        value: 250,
        source: "youtube_api",
        rawName: "views",
        observedAt: NOW.toISOString(),
        fetchedAt: NOW.toISOString(),
        window: "lifetime",
      }),
      NOW,
    );

    expect(progress.percent).toBe(25);
    expect(describeProgress(progress)).toMatch(/25% of the target/);
  });

  it("never describes a goal as a forecast", () => {
    const progress = measureGoal(
      goal(),
      unavailable("views_or_plays", "platform_not_connected"),
      NOW,
    );

    const sentence = describeProgress(progress);
    expect(sentence).not.toMatch(
      /on track|projected|expect|forecast|will reach/i,
    );
  });
});

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

describe("experiments are observational and never auto-concluded", () => {
  it("refuses to conclude with only one arm", () => {
    const readiness = experimentReadiness({
      postsPerArm: new Map([["question titles", 10]]),
      status: "running",
    });

    expect(readiness.canConclude).toBe(false);
    expect(readiness.confidence).toBe("insufficient_data");
    expect(readiness.reason).toMatch(/two arms/);
  });

  it("refuses to conclude when an arm has too few posts", () => {
    const readiness = experimentReadiness({
      postsPerArm: new Map([
        ["question", 8],
        ["statement", 2],
      ]),
      status: "running",
    });

    expect(readiness.canConclude).toBe(false);
    expect(readiness.reason).toMatch(/indistinguishable from chance/);
  });

  it("allows a cautious conclusion at a modest size, labelled as such", () => {
    const readiness = experimentReadiness({
      postsPerArm: new Map([
        ["question", 4],
        ["statement", 4],
      ]),
      status: "running",
    });

    expect(readiness.canConclude).toBe(true);
    expect(readiness.confidence).toBe("early_signal");
    expect(readiness.reason).toMatch(/lead/);
  });

  it("never reaches better than moderate evidence", () => {
    // Observational data over a live schedule cannot support more, and saying
    // otherwise would lend a result authority it has not earned.
    const readiness = experimentReadiness({
      postsPerArm: new Map([
        ["question", 50],
        ["statement", 50],
      ]),
      status: "running",
    });

    expect(readiness.confidence).toBe("moderate_evidence");
  });

  it("states plainly that these are not A/B tests", () => {
    expect(OBSERVATIONAL_NOTE).toMatch(/observational/i);
    expect(OBSERVATIONAL_NOTE).toMatch(/never as proof/i);
  });
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

describe("scheduled synchronisation", () => {
  it("declares itself not running without a Trigger.dev project", async () => {
    const previous = process.env.TRIGGER_PROJECT_REF;
    delete process.env.TRIGGER_PROJECT_REF;

    const { analyticsSchedulingConnected } =
      await import("@/trigger/analytics");

    expect(analyticsSchedulingConnected()).toBe(false);

    process.env.TRIGGER_PROJECT_REF = "proj_not_configured";
    expect(analyticsSchedulingConnected()).toBe(false);

    if (previous === undefined) {
      delete process.env.TRIGGER_PROJECT_REF;
    } else {
      process.env.TRIGGER_PROJECT_REF = previous;
    }
  });

  it("refreshes lifetime always and closed windows only", () => {
    const tenDaysOld = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    const windows = windowsDueFor(tenDaysOld, NOW);

    expect(windows).toContain("lifetime");
    expect(windows).toContain("first_24h");
    expect(windows).toContain("first_7d");
    expect(windows).not.toContain("first_28d");
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

describe("analytics audit vocabulary", () => {
  it("names every Stage 10 action", () => {
    for (const action of [
      "analytics_sync_started",
      "analytics_sync_completed",
      "analytics_sync_failed",
      "analytics_permission_required",
      "analytics_manual_entry_recorded",
      "growth_goal_created",
      "growth_goal_updated",
      "growth_experiment_created",
      "growth_experiment_completed",
    ]) {
      expect([...AUDIT_ACTIONS], action).toContain(action);
    }
  });

  it("writes those actions from the code that performs them", () => {
    // Stage 6 declared publish actions nothing ever wrote. These assertions
    // exist so the Stage 10 vocabulary cannot become decorative the same way.
    const sync = readFileSync(
      join(process.cwd(), "src", "lib", "analytics", "sync.ts"),
      "utf8",
    );

    expect(sync).toMatch(/analytics_sync_started/);
    expect(sync).toMatch(/analytics_sync_completed/);
    expect(sync).toMatch(/analytics_sync_failed/);
    expect(sync).toMatch(/analytics_permission_required/);
    // The worker runs outside a request, so it must use the worker-safe writer.
    expect(sync).toMatch(/recordAuditAsWorker/);
  });

  it("never writes a metric value or a token into the audit log", () => {
    const sync = readFileSync(
      join(process.cwd(), "src", "lib", "analytics", "sync.ts"),
      "utf8",
    );

    // The audit records counts, not data. A second and diverging copy of the
    // figures would be worse than none.
    const auditCalls =
      sync.match(/recordAuditAsWorker\([\s\S]*?\n  \);/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);

    for (const call of auditCalls) {
      expect(call).not.toMatch(/accessToken|access_token|credential/);
      expect(call).not.toMatch(/metric_value|metricValue/);
    }
  });
});
