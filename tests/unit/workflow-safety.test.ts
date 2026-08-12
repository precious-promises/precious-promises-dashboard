// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, sanitiseMetadata } from "@/lib/audit/types";
import { classifyProductionStage } from "@/lib/production/stage";
import { BOARD_STAGES, UNREACHABLE_STAGES } from "@/lib/production/stage";
import { canTransitionPublish } from "@/lib/publishing/lifecycle";
import {
  SCHEDULE_STATUSES,
  SCHEDULE_STATUS_LABELS,
  UNPUBLISHED_OUTCOME_STATUSES,
} from "@/lib/schedule/types";

/**
 * Stage 5 safety guarantees that span the codebase.
 *
 * Two rules, both project-level: **nothing may claim to publish**, and the
 * audit log must never carry a secret.
 */

const SRC_ROOT = join(process.cwd(), "src");

function sourceFiles(): string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => join(SRC_ROOT, entry));
}

describe("an incomplete outcome is never a publication", () => {
  /**
   * Stage 6 held `ready_for_manual_post` and `uploaded_to_platform_draft` out
   * of the vocabulary because no provider could reach them, and this test
   * asserted their absence. Stage 9 made both genuinely reachable — TikTok
   * writes each of them — so the absence check would now be asserting a bug.
   *
   * What replaces it is the guarantee that actually matters: these statuses
   * exist, they are labelled, and **neither can become `posted`**. This system
   * did not publish them and holds no platform id proving anybody did.
   */
  it("names and labels both incomplete outcomes", () => {
    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      expect([...SCHEDULE_STATUSES], status).toContain(status);
      expect(SCHEDULE_STATUS_LABELS[status], status).toBeTruthy();
    }
  });

  it("refuses to promote an incomplete outcome to posted", () => {
    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      expect(canTransitionPublish(status, "posted"), status).toBe(false);
    }
  });

  it("lets an incomplete outcome be rescheduled or stood down", () => {
    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      expect(canTransitionPublish(status, "scheduled"), status).toBe(true);
      expect(canTransitionPublish(status, "cancelled"), status).toBe(true);
    }
  });

  it("reaches them only from publishing", () => {
    for (const status of UNPUBLISHED_OUTCOME_STATUSES) {
      for (const from of SCHEDULE_STATUSES) {
        expect(canTransitionPublish(from, status), `${from} -> ${status}`).toBe(
          from === "publishing",
        );
      }
    }
  });

  it("leaves publish as the only unreachable production stage", () => {
    expect([...UNREACHABLE_STAGES]).toEqual(["publish"]);
  });

  it("keeps publish off the board entirely", () => {
    expect([...BOARD_STAGES]).not.toContain("publish");
  });

  it("cannot classify anything into publish, whatever the signals", () => {
    const flags = [true, false];

    for (const hasScript of flags) {
      for (const hasVariantReadyForReview of flags) {
        for (const hasVideo of flags) {
          for (const hasValidApproval of flags) {
            for (const hasActiveSchedule of flags) {
              const stage = classifyProductionStage(
                {
                  status: "draft",
                  scripture_reference: null,
                  scripture_verification_status: "unverified",
                },
                {
                  hasScript,
                  hasVariantReadyForReview,
                  hasVideo,
                  hasValidApproval,
                  hasActiveSchedule,
                },
              );

              expect(stage).not.toBe("publish");
            }
          }
        }
      }
    }
  });

  it("keeps every platform API call inside an integration module", () => {
    // A grep, deliberately. The guarantee that replaced "nothing reaches a
    // platform" is narrower but still a property of the whole tree: only an
    // integration module may name a platform host, so no page, action or
    // scheduling path can start talking to one.
    const forbidden =
      /(googleapis\.com|accounts\.google\.com|graph\.facebook\.com|graph\.instagram\.com|rupload\.facebook\.com|api\.instagram\.com|api\.tiktok\.com|open-api\.tiktok\.com)/i;

    const integrationDirs = [
      join("src", "lib", "youtube"),
      join("src", "lib", "drive"),
      join("src", "lib", "instagram"),
    ];

    for (const file of sourceFiles()) {
      if (integrationDirs.some((dir) => file.includes(dir))) {
        continue;
      }
      expect(
        readFileSync(file, "utf8"),
        `${file} contacts a platform directly`,
      ).not.toMatch(forbidden);
    }
  });

  it("keeps the scheduling code free of any platform call", () => {
    // The specific worry this started as: a schedule must not execute itself.
    const forbidden = /(googleapis\.com|accounts\.google\.com)/i;

    for (const file of sourceFiles()) {
      if (!file.includes(join("src", "lib", "schedule"))) {
        continue;
      }
      expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    }
  });

  it("says plainly in the scheduling code that nothing executes", () => {
    const actions = readFileSync(
      join(SRC_ROOT, "app/dashboard/calendar/actions.ts"),
      "utf8",
    );

    expect(actions).toMatch(/nothing executes a schedule/i);
  });
});

describe("derived production stages", () => {
  const item = {
    status: "draft" as const,
    scripture_reference: "2 Peter 1:4",
    scripture_verification_status: "manually_verified" as const,
  };

  const base = {
    hasScript: false,
    hasVariantReadyForReview: false,
    hasVideo: false,
    hasValidApproval: false,
    hasActiveSchedule: false,
  };

  it("puts an untouched item in plan", () => {
    expect(classifyProductionStage(item, base)).toBe("plan");
  });

  it("moves to write once a script exists", () => {
    expect(classifyProductionStage(item, { ...base, hasScript: true })).toBe(
      "write",
    );
  });

  it("moves to produce once a video composition exists", () => {
    expect(
      classifyProductionStage(item, {
        ...base,
        hasScript: true,
        hasVideo: true,
      }),
    ).toBe("produce");
  });

  it("moves to review when a variant is ready", () => {
    expect(
      classifyProductionStage(item, {
        ...base,
        hasVideo: true,
        hasVariantReadyForReview: true,
      }),
    ).toBe("review");
  });

  it("moves to approve only on a valid approval", () => {
    expect(
      classifyProductionStage(item, { ...base, hasValidApproval: true }),
    ).toBe("approve");
  });

  it("does not reach approve on an approval that has been invalidated", () => {
    // An invalidated approval is cleared in the database, so the signal is
    // false — and the item falls back to where its other records put it.
    expect(
      classifyProductionStage(item, {
        ...base,
        hasValidApproval: false,
        hasVariantReadyForReview: true,
      }),
    ).toBe("review");
  });

  it("moves to schedule once something is actively scheduled", () => {
    expect(
      classifyProductionStage(item, {
        ...base,
        hasValidApproval: true,
        hasActiveSchedule: true,
      }),
    ).toBe("schedule");
  });

  it("still lets unverified Scripture outrank everything downstream", () => {
    expect(
      classifyProductionStage(
        { ...item, scripture_verification_status: "verification_required" },
        {
          hasScript: true,
          hasVariantReadyForReview: true,
          hasVideo: true,
          hasValidApproval: true,
          hasActiveSchedule: true,
        },
      ),
    ).toBe("verify_scripture");
  });

  it("keeps an archived item out of production", () => {
    expect(
      classifyProductionStage(
        { ...item, status: "archived" },
        { ...base, hasActiveSchedule: true },
      ),
    ).toBe("plan");
  });
});

describe("audit metadata never carries a secret", () => {
  it("records the workflow actions Stage 5 needs", () => {
    for (const action of [
      "variant_submitted_for_review",
      "variant_approved",
      "variant_rejected",
      "approval_invalidated",
      "post_scheduled",
      "schedule_cancelled",
      "recurring_rule_created",
      "recurring_rule_updated",
    ]) {
      expect([...AUDIT_ACTIONS]).toContain(action);
    }
  });

  it("drops anything whose key looks like a credential", () => {
    const safe = sanitiseMetadata({
      platform: "youtube",
      access_token: "should-never-be-stored",
      refreshToken: "should-never-be-stored",
      SUPABASE_KEY: "should-never-be-stored",
      password: "should-never-be-stored",
      authorization: "Bearer x",
      cookie: "session=x",
    });

    expect(safe).toEqual({ platform: "youtube" });
  });

  it("keeps ordinary descriptive values", () => {
    const safe = sanitiseMetadata({
      platform: "youtube",
      revision: 4,
      enabled: true,
      reason: null,
    });

    expect(safe).toEqual({
      platform: "youtube",
      revision: 4,
      enabled: true,
      reason: null,
    });
  });

  it("truncates long strings rather than copying content wholesale", () => {
    const safe = sanitiseMetadata({ reason: "x".repeat(900) });

    expect(String(safe.reason)).toHaveLength(501);
  });

  it("drops values it cannot describe safely", () => {
    const safe = sanitiseMetadata({
      nested: { token: "hidden" },
      list: [1, 2, 3],
    });

    expect(safe).toEqual({});
  });
});
