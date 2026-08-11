// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { ContentItem } from "@/lib/content/types";
import {
  holdsClaim,
  isClaimExpired,
  leaseExpiry,
  newClaimToken,
  releaseClaim,
} from "@/lib/publishing/claim";
import {
  classifyThrown,
  ERROR_CATEGORIES,
  isRetryable,
  RETRYABLE_CATEGORIES,
  safeError,
  sanitiseErrorMessage,
} from "@/lib/publishing/errors";
import {
  evaluatePublishGate,
  GATE_CHECKS,
  type GateInput,
} from "@/lib/publishing/gate";
import {
  canonicaliseOperation,
  idempotencyKeyFor,
  isSameOperation,
} from "@/lib/publishing/idempotency";
import {
  canRecordPosted,
  canTransitionPublish,
  failedUpdate,
  isInFlight,
  isTerminalStatus,
  postedUpdate,
} from "@/lib/publishing/lifecycle";
import {
  anyProviderImplemented,
  getPublishingProvider,
  PROVIDER_STATUS,
  providerStatusFor,
} from "@/lib/publishing/providers";
import { nextAttemptNumber } from "@/lib/publishing/types";
import { SCHEDULE_STATUSES, type ScheduledPost } from "@/lib/schedule/types";
import type { PlatformVariant } from "@/lib/variants/types";

/**
 * The publishing infrastructure's central invariant: **nothing is published
 * unless the platform said so.**
 *
 * Stage 6 held this by having no provider at all. Stage 7 added a real YouTube
 * adapter, so the invariant now rests where it always should have: the safety
 * gate refuses before anything is sent, `posted` cannot be constructed without
 * the platform's own post id, and the database refuses the row anyway.
 */

const HASH = "a".repeat(64);
const NOW = new Date("2026-08-11T18:30:00Z");

function post(overrides: Partial<ScheduledPost> = {}): ScheduledPost {
  return {
    id: "post-1",
    owner_id: "owner-1",
    platform_variant_id: "variant-1",
    scheduled_for: "2026-08-11T18:30:00Z",
    timezone: "Europe/London",
    status: "queued",
    approval_hash: HASH,
    recurring_rule_id: null,
    paused_at: null,
    pause_reason: null,
    cancelled_at: null,
    cancellation_reason: null,
    attempt_count: 0,
    claimed_at: NOW.toISOString(),
    claim_token: "token-1",
    claim_expires_at: new Date(NOW.getTime() + 600_000).toISOString(),
    claimed_by: "publish-dispatcher",
    queued_at: NOW.toISOString(),
    publishing_started_at: null,
    posted_at: null,
    external_post_id: null,
    external_post_url: null,
    last_error_code: null,
    last_error_message: null,
    external_processing_status: null,
    external_processing_checked_at: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function variant(overrides: Partial<PlatformVariant> = {}): PlatformVariant {
  return {
    id: "variant-1",
    owner_id: "owner-1",
    content_item_id: "item-1",
    platform: "youtube",
    variant_type: "youtube_short",
    title: "A title",
    caption: "A caption",
    description: null,
    hashtags: [],
    first_comment: null,
    cta: null,
    thumbnail_text: null,
    review_state: "approved",
    approved_at: "2026-08-08T00:00:00Z",
    approved_by: "owner-1",
    approval_hash: HASH,
    rejected_at: null,
    rejected_by: null,
    rejection_reason: null,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function item(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-1",
    owner_id: "owner-1",
    title: "A promise",
    content_type: "youtube_short",
    topic: null,
    scripture_reference: "2 Peter 1:4",
    scripture_text: "…",
    scripture_translation: "KJV",
    scripture_verification_status: "manually_verified",
    scripture_verified_at: "2026-08-08T00:00:00Z",
    scripture_verified_by: "owner-1",
    description: null,
    status: "draft",
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function gate(overrides: Partial<GateInput> = {}): GateInput {
  return {
    post: post(),
    variant: variant(),
    item: item(),
    currentFingerprint: HASH,
    hasVideo: true,
    mediaCount: 0,
    successfulAttemptExists: false,
    claimToken: "token-1",
    providerAvailable: true,
    now: NOW,
    ...overrides,
  };
}

describe("the provider registry", () => {
  it("has adapters for YouTube and Instagram, and none for TikTok", () => {
    expect(getPublishingProvider("youtube")).not.toBeNull();
    expect(getPublishingProvider("instagram")).not.toBeNull();
    expect(getPublishingProvider("tiktok")).toBeNull();
  });

  it("says plainly which Instagram formats are refused, and why", () => {
    // Reels upload as bytes; images and carousels would need media exposed on
    // a publicly reachable URL, which this application will not do.
    const instagram = providerStatusFor("instagram");

    expect(instagram.implemented).toBe(true);
    expect(instagram.detail).toMatch(/Reels/);
    expect(instagram.detail).toMatch(/publicly reachable URL/i);
  });

  it("describes every platform, with a reason", () => {
    expect(PROVIDER_STATUS).toHaveLength(3);
    for (const status of PROVIDER_STATUS) {
      expect(status.detail.length).toBeGreaterThan(10);
    }
    expect(anyProviderImplemented()).toBe(true);
  });

  it("distinguishes an adapter existing from a publish being possible", () => {
    // The one that matters. "Implemented" is a fact about this repository;
    // whether a publish would succeed depends on a connected account and on
    // media that can actually be fetched.
    const youtube = providerStatusFor("youtube");

    expect(youtube.implemented).toBe(true);
    expect(youtube.detail).toContain("media_source_unavailable");
  });

  it("reports an unbuilt platform as unimplemented rather than throwing", () => {
    expect(providerStatusFor("tiktok").implemented).toBe(false);
  });
});

describe("posted is unreachable", () => {
  it("is only reachable from publishing in the state machine", () => {
    for (const from of SCHEDULE_STATUSES) {
      expect(canTransitionPublish(from, "posted"), from).toBe(
        from === "publishing",
      );
    }
  });

  it("requires the platform's own post id", () => {
    expect(canRecordPosted("publishing", "yt_abc123")).toBe(true);
    expect(canRecordPosted("publishing", null)).toBe(false);
    expect(canRecordPosted("publishing", "")).toBe(false);
    expect(canRecordPosted("publishing", "   ")).toBe(false);
  });

  it("cannot be constructed without an external id", () => {
    // There is no overload of postedUpdate that takes no id, and an empty one
    // yields null — so a caller holding nothing from a provider cannot build a
    // posted update by mistake.
    expect(postedUpdate("", null, NOW)).toBeNull();
    expect(postedUpdate("yt_abc123", null, NOW)?.status).toBe("posted");
  });

  it("is refused by the gate for every provider-less run", () => {
    // The decisive one: with no provider, the gate stops before anything is
    // sent, so no code path reaches the provider call at all.
    const result = evaluatePublishGate(gate({ providerAvailable: false }));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe("provider_not_connected");
      expect(result.error.retryable).toBe(false);
    }
  });

  it("is terminal once reached", () => {
    expect(isTerminalStatus("posted")).toBe(true);
    for (const to of SCHEDULE_STATUSES) {
      expect(canTransitionPublish("posted", to), to).toBe(false);
    }
  });

  it("is never written as a literal by the worker", () => {
    const worker = readFileSync(
      join(process.cwd(), "src/lib/publishing/worker.ts"),
      "utf8",
    );

    // The only route to `posted` is postedUpdate(), which requires an id.
    expect(worker).not.toMatch(/status:\s*["']posted["']/);
    expect(worker).toContain("postedUpdate(");
  });

  it("is refused by the database without an external id", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809020000_create_publishing_infrastructure.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /scheduled_posts_posted_requires_external_id[\s\S]*?status <> 'posted'[\s\S]*?external_post_id is not null/,
    );
    expect(migration).toMatch(
      /publish_attempts_success_requires_external_id[\s\S]*?status <> 'succeeded' or external_post_id is not null/,
    );
    expect(migration).toMatch(
      /publish_attempts_none_provider_cannot_succeed[\s\S]*?provider <> 'none' or status <> 'succeeded'/,
    );
  });
});

describe("the execution-time safety gate", () => {
  it("allows a fully valid run", () => {
    expect(evaluatePublishGate(gate()).allowed).toBe(true);
  });

  const refusals: [string, Partial<GateInput>, string][] = [
    ["the post has vanished", { post: null }, "invalid_content"],
    [
      "the schedule was cancelled",
      {
        post: post({
          status: "cancelled",
          cancelled_at: NOW.toISOString(),
          cancellation_reason: "No",
        }),
      },
      "schedule_cancelled",
    ],
    [
      "the schedule was paused",
      {
        post: post({
          status: "paused",
          paused_at: NOW.toISOString(),
          pause_reason: "Approval invalidated",
        }),
      },
      "schedule_paused",
    ],
    [
      "it has already been published",
      { successfulAttemptExists: true },
      "already_published",
    ],
    [
      "another worker holds the claim",
      { claimToken: "someone-else" },
      "claim_lost",
    ],
    [
      "the claim lease has expired",
      { post: post({ claim_expires_at: "2026-08-11T18:00:00Z" }) },
      "claim_lost",
    ],
    ["the variant has vanished", { variant: null }, "invalid_content"],
    [
      "the variant is not approved",
      {
        variant: variant({
          review_state: "ready_for_review",
          approved_at: null,
          approved_by: null,
          approval_hash: null,
        }),
      },
      "not_approved",
    ],
    [
      "the approval no longer matches the content",
      { currentFingerprint: "b".repeat(64) },
      "approval_stale",
    ],
    [
      "the schedule rests on a different approval",
      { post: post({ approval_hash: "c".repeat(64) }) },
      "approval_stale",
    ],
    ["the content item has vanished", { item: null }, "invalid_content"],
    [
      "the content is archived",
      { item: item({ status: "archived" }) },
      "invalid_content",
    ],
    [
      "the Scripture is not verified",
      {
        item: item({ scripture_verification_status: "verification_required" }),
      },
      "scripture_unverified",
    ],
    ["the video composition is missing", { hasVideo: false }, "missing_asset"],
    [
      "an image post has no media",
      {
        item: item({ content_type: "instagram_image" }),
        hasVideo: false,
        mediaCount: 0,
      },
      "missing_asset",
    ],
    [
      "no provider is connected",
      { providerAvailable: false },
      "provider_not_connected",
    ],
  ];

  it.each(refusals)("refuses when %s", (_label, overrides, code) => {
    const result = evaluatePublishGate(gate(overrides));

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.error.code).toBe(code);
    }
  });

  it("treats every refusal as non-retryable", () => {
    // A gate refusal is this system saying no. Retrying without changing
    // anything would just be told no again.
    for (const [, overrides] of refusals) {
      const result = evaluatePublishGate(gate(overrides));
      if (!result.allowed) {
        expect(result.error.retryable).toBe(false);
      }
    }
  });

  it("refuses a post that is not queued or publishing", () => {
    for (const status of ["scheduled", "failed"] as const) {
      const result = evaluatePublishGate(
        gate({
          post: post({
            status,
            last_error_code: status === "failed" ? "unknown" : null,
          }),
        }),
      );
      expect(result.allowed, status).toBe(false);
    }
  });

  it("checks cancellation before staleness", () => {
    // A cancelled post must be reported as cancelled, not as some downstream
    // problem the owner would try to fix.
    const result = evaluatePublishGate(
      gate({
        post: post({
          status: "cancelled",
          cancelled_at: NOW.toISOString(),
          cancellation_reason: "No",
          approval_hash: "different",
        }),
        currentFingerprint: "b".repeat(64),
      }),
    );

    if (!result.allowed) {
      expect(result.error.code).toBe("schedule_cancelled");
    }
  });

  it("documents every check it performs", () => {
    expect(GATE_CHECKS).toContain("claim_held");
    expect(GATE_CHECKS).toContain("approval_matches_content");
    expect(GATE_CHECKS).toContain("provider_available");
    expect(new Set(GATE_CHECKS).size).toBe(GATE_CHECKS.length);
  });
});

describe("the worker revalidates immediately before the provider call", () => {
  const worker = readFileSync(
    join(process.cwd(), "src/lib/publishing/worker.ts"),
    "utf8",
  );

  it("reloads the schedule, variant and item inside the run", () => {
    expect(worker).toMatch(/from\("scheduled_posts"\)[\s\S]*?\.select\("\*"\)/);
    expect(worker).toMatch(/from\("platform_variants"\)/);
    expect(worker).toMatch(/from\("content_items"\)/);
  });

  it("recomputes the approval fingerprint rather than trusting a stored one", () => {
    expect(worker).toContain("approvalFingerprint(");
    expect(worker).toContain("approvalSubjectFrom(");
  });

  it("runs the gate before any provider call", () => {
    const gateIndex = worker.indexOf("evaluatePublishGate(");
    const publishIndex = worker.indexOf("provider!.publish(");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(publishIndex);
  });

  it("re-verifies the claim before writing an outcome", () => {
    expect(worker).toContain("holdsClaim(");
  });
});

describe("idempotency", () => {
  const operation = {
    scheduledPostId: "post-1",
    platform: "youtube" as const,
    approvalHash: HASH,
  };

  it("is deterministic", () => {
    expect(idempotencyKeyFor(operation)).toBe(
      idempotencyKeyFor({ ...operation }),
    );
  });

  it("binds the schedule, the platform and the approval", () => {
    const canonical = canonicaliseOperation(operation);

    expect(canonical).toContain("post=post-1");
    expect(canonical).toContain("platform=youtube");
    expect(canonical).toContain(`approval=${HASH}`);
  });

  it("differs per platform, so one wording going to two places is two operations", () => {
    expect(idempotencyKeyFor({ ...operation, platform: "tiktok" })).not.toBe(
      idempotencyKeyFor(operation),
    );
  });

  it("differs per schedule", () => {
    expect(
      idempotencyKeyFor({ ...operation, scheduledPostId: "post-2" }),
    ).not.toBe(idempotencyKeyFor(operation));
  });

  it("changes when the approval changes, so re-approved content is a new operation", () => {
    // Re-approving materially changed content must not be deduplicated
    // against the old approval: the new wording has never been published.
    expect(
      idempotencyKeyFor({ ...operation, approvalHash: "d".repeat(64) }),
    ).not.toBe(idempotencyKeyFor(operation));
  });

  it("stays the same across a retry of the unchanged operation", () => {
    expect(isSameOperation(operation, { ...operation })).toBe(true);
    expect(
      isSameOperation(operation, {
        ...operation,
        approvalHash: "e".repeat(64),
      }),
    ).toBe(false);
  });

  it("produces a key the database will accept", () => {
    const key = idempotencyKeyFor(operation);

    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key.length).toBeLessThanOrEqual(200);
    expect(key.startsWith("pp_publish_youtube_")).toBe(true);
  });

  it("is protected by a database uniqueness rule as well as by code", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809020000_create_publishing_infrastructure.sql",
      ),
      "utf8",
    );

    // Partial: failed and blocked attempts share a key by design, because they
    // are retries of the same operation. Only success is unique.
    expect(migration).toMatch(
      /create unique index[\s\S]*?publish_attempts_one_success_per_operation[\s\S]*?where status = 'succeeded'/,
    );
  });
});

describe("claims and leases", () => {
  it("issues a distinct token each time", () => {
    expect(newClaimToken()).not.toBe(newClaimToken());
  });

  it("recognises the holder of a live claim", () => {
    expect(holdsClaim(post(), "token-1", NOW)).toBe(true);
  });

  it("refuses a different worker's token", () => {
    expect(holdsClaim(post(), "token-2", NOW)).toBe(false);
  });

  it("refuses an expired lease even with the right token", () => {
    // The crash-recovery path: a worker whose lease lapsed must assume another
    // worker has taken over.
    const stale = post({ claim_expires_at: "2026-08-11T18:00:00Z" });

    expect(isClaimExpired(stale, NOW)).toBe(true);
    expect(holdsClaim(stale, "token-1", NOW)).toBe(false);
  });

  it("treats an unclaimed post as expired, so it can be claimed", () => {
    expect(
      isClaimExpired({ claim_token: null, claim_expires_at: null }, NOW),
    ).toBe(true);
  });

  it("computes a lease that ends in the future", () => {
    expect(leaseExpiry(NOW, 600).getTime()).toBe(NOW.getTime() + 600_000);
    expect(leaseExpiry(NOW, 0).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("releases every part of the claim at once", () => {
    expect(releaseClaim()).toEqual({
      claim_token: null,
      claimed_at: null,
      claim_expires_at: null,
      claimed_by: null,
    });
  });

  it("claims atomically in the database, skipping locked rows", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260809020000_create_publishing_infrastructure.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("for update skip locked");
    expect(migration).toMatch(
      /claim_expires_at is null or sp\.claim_expires_at < p_now/,
    );
  });
});

describe("error classification", () => {
  it("retries only what could plausibly succeed later", () => {
    expect([...RETRYABLE_CATEGORIES]).toEqual([
      "network",
      "provider_timeout",
      "provider_rate_limited",
      "provider_unavailable",
    ]);
  });

  it("treats every safety refusal as non-retryable", () => {
    for (const category of [
      "not_approved",
      "approval_stale",
      "scripture_unverified",
      "missing_asset",
      "invalid_content",
      "provider_not_connected",
      "provider_permission_revoked",
      "provider_rejected_media",
      "schedule_cancelled",
      "already_published",
    ] as const) {
      expect(isRetryable(category), category).toBe(false);
    }
  });

  it("defaults an unrecognised error to non-retryable", () => {
    // Guessing that an unfamiliar error is transient is how a post goes out
    // twice.
    expect(classifyThrown(new Error("something odd")).code).toBe("unknown");
    expect(classifyThrown(new Error("something odd")).retryable).toBe(false);
  });

  it("classifies transient failures as retryable", () => {
    expect(classifyThrown(new Error("connect ETIMEDOUT")).code).toBe(
      "provider_timeout",
    );
    expect(classifyThrown(new Error("fetch failed")).retryable).toBe(true);
    expect(classifyThrown(new Error("429 Too Many Requests")).code).toBe(
      "provider_rate_limited",
    );
    expect(classifyThrown(new Error("503 Service Unavailable")).retryable).toBe(
      true,
    );
  });

  it("gives every category a label", () => {
    for (const category of ERROR_CATEGORIES) {
      expect(safeError(category).message.length, category).toBeGreaterThan(3);
    }
  });
});

describe("error sanitisation", () => {
  it("redacts bearer tokens", () => {
    expect(
      sanitiseErrorMessage("Request failed: Bearer ya29.A0ARrdaM-secret"),
    ).not.toContain("ya29");
  });

  it("redacts Supabase and Trigger keys", () => {
    const text = sanitiseErrorMessage(
      "using sb_secret_abc123def and tr_dev_xyz789",
    );

    expect(text).not.toContain("sb_secret_abc123def");
    expect(text).not.toContain("tr_dev_xyz789");
  });

  it("redacts JWTs", () => {
    expect(
      sanitiseErrorMessage("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig"),
    ).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  it("redacts named credentials in prose", () => {
    for (const text of [
      'access_token: "abc123secret"',
      "client_secret=hunter2value",
      "authorization: Basic dXNlcjpwYXNz",
    ]) {
      const safe = sanitiseErrorMessage(text);
      expect(safe, text).toContain("[redacted]");
    }
  });

  it("redacts before truncating, so nothing survives past the cut", () => {
    const safe = sanitiseErrorMessage(
      `${"x".repeat(600)} Bearer ya29.leaked-token`,
    );

    expect(safe).not.toContain("ya29");
  });

  it("bounds the length", () => {
    expect(sanitiseErrorMessage("y".repeat(900)).length).toBeLessThanOrEqual(
      501,
    );
  });

  it("does not serialise an object whose shape nobody checked", () => {
    expect(sanitiseErrorMessage({ token: "secret" })).not.toContain("secret");
  });

  it("keeps an ordinary message readable", () => {
    expect(sanitiseErrorMessage("The upload was rejected.")).toBe(
      "The upload was rejected.",
    );
  });
});

describe("attempts", () => {
  it("numbers from 1 and only increases", () => {
    expect(nextAttemptNumber(null)).toBe(1);
    expect(nextAttemptNumber(0)).toBe(1);
    expect(nextAttemptNumber(3)).toBe(4);
    expect(nextAttemptNumber(Number.NaN)).toBe(1);
  });

  it("records a failure with its code and releases the claim", () => {
    const update = failedUpdate("provider_timeout", "Platform timed out");

    expect(update.status).toBe("failed");
    expect(update.last_error_code).toBe("provider_timeout");
    expect(update.claim_token).toBeNull();
  });
});

describe("the lifecycle as a whole", () => {
  it("lets a claimed job be stood down but not an in-flight one", () => {
    expect(canTransitionPublish("queued", "cancelled")).toBe(true);
    expect(canTransitionPublish("queued", "paused")).toBe(true);
    // Once a provider call is in flight, only its outcome may follow.
    expect(canTransitionPublish("publishing", "paused")).toBe(false);
    expect(canTransitionPublish("publishing", "cancelled")).toBe(false);
  });

  it("marks queued and publishing as the worker's territory", () => {
    expect(isInFlight("queued")).toBe(true);
    expect(isInFlight("publishing")).toBe(true);
    expect(isInFlight("scheduled")).toBe(false);
  });

  it("lets a failed post be rescheduled rather than stranding it", () => {
    expect(canTransitionPublish("failed", "scheduled")).toBe(true);
  });

  it("keeps cancellation terminal", () => {
    for (const to of SCHEDULE_STATUSES) {
      expect(canTransitionPublish("cancelled", to), to).toBe(false);
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const status of SCHEDULE_STATUSES) {
      expect(canTransitionPublish(status, status), status).toBe(false);
    }
  });
});

describe("platform contact is confined to one place", () => {
  const SRC_ROOT = join(process.cwd(), "src");

  function sourceFiles(): string[] {
    return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf8" })
      .filter((entry) => /\.tsx?$/.test(entry))
      .map((entry) => join(SRC_ROOT, entry));
  }

  /** The only directories permitted to name a platform host. */
  const INTEGRATION_DIRS = [
    join("src", "lib", "youtube"),
    join("src", "lib", "drive"),
    join("src", "lib", "instagram"),
  ];

  it("names a platform host only inside an integration module", () => {
    // The guard says where a platform request may originate: only from an
    // integration module, so a page, an action or the scheduler cannot start
    // quietly talking to a platform.
    const forbidden =
      /(googleapis\.com|accounts\.google\.com|graph\.facebook\.com|graph\.instagram\.com|rupload\.facebook\.com|api\.instagram\.com|api\.tiktok\.com|open-api\.tiktok\.com)/i;

    for (const file of sourceFiles()) {
      if (INTEGRATION_DIRS.some((dir) => file.includes(dir))) {
        continue;
      }
      expect(
        readFileSync(file, "utf8"),
        `${file} contacts a platform directly`,
      ).not.toMatch(forbidden);
    }
  });

  it("still contacts no TikTok host anywhere", () => {
    // TikTok has no adapter, so no module has any business naming its hosts.
    const forbidden = /(api\.tiktok\.com|open-api\.tiktok\.com)/i;

    for (const file of sourceFiles()) {
      expect(
        readFileSync(file, "utf8"),
        `${file} contacts an unbuilt platform`,
      ).not.toMatch(forbidden);
    }
  });

  it("makes media public nowhere", () => {
    // The refusal that shaped the whole Instagram design: no code path turns a
    // Drive file into a publicly reachable URL, and none serves media to the
    // open internet on Meta's behalf.
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      expect(contents, `${file} changes Drive sharing`).not.toMatch(
        /permissions\.create|anyoneWithLink|"anyone"/i,
      );
    }
  });

  it("keeps the worker credential out of every client component", () => {
    for (const file of sourceFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!/^\s*(["'])use client\1/m.test(contents)) {
        continue;
      }
      expect(contents, `${file} is a client component`).not.toContain(
        "SUPABASE_SECRET_KEY",
      );
    }
  });
});
