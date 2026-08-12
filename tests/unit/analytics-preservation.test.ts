// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assessAnalyticsReadiness } from "@/lib/analytics/readiness";
import { buildWeeklyMission, missionAbsenceReason } from "@/lib/growth/mission";
import {
  findMissingPlatformCandidates,
  findShortsCandidates,
  findTopicGapCandidates,
} from "@/lib/growth/repurpose";
import type { AnalysedPost, WinningPost } from "@/lib/growth/analysis";

/**
 * What this file defends.
 *
 * Stage 10 reads numbers from other people's systems. Three things can go
 * wrong that no amount of careful UI copy would undo:
 *
 * 1. **A failed fetch destroying a good figure.** Analytics APIs fail
 *    constantly — quota, expiry, transient 5xx. If a failure cleared the
 *    stored reading, an outage would look like a collapse in performance.
 * 2. **A third-party deletion rewriting publishing history.** If someone
 *    deletes a video at YouTube, the analytics reader must not be able to
 *    reach back and unmark the post as published. It *was* published.
 * 3. **A planning suggestion acting on itself.** The Growth Centre suggests;
 *    it must never approve, schedule or publish, because approval is the one
 *    gate this product cannot lose.
 *
 * Several of these are asserted against source text rather than behaviour.
 * That is deliberate: the guarantee is the *absence* of an operation, and you
 * cannot write a runtime test that proves a delete never happens anywhere.
 */

const ROOT = join(__dirname, "..", "..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

const ANALYTICS_LIB = [
  "src/lib/analytics/repository.ts",
  "src/lib/analytics/sync.ts",
  "src/lib/analytics/overview.ts",
  "src/lib/analytics/manual.ts",
];

// ---------------------------------------------------------------------------

describe("a failed fetch never destroys a good figure", () => {
  it("has no delete in any analytics write path", () => {
    for (const file of ANALYTICS_LIB) {
      expect(source(file)).not.toMatch(/\.delete\(/);
    }
  });

  it("writes observations by upsert, so an old reading survives a new failure", () => {
    const repository = source("src/lib/analytics/repository.ts");

    expect(repository).toMatch(/from\("analytics_snapshots"\)\s*\.upsert\(/);
    // A failure path that wrote a snapshot with no metrics over a good one
    // would be the same bug wearing an upsert. Metrics are only written when
    // the fetch actually returned some.
    expect(repository).toMatch(/if \(input\.metrics\.length === 0\)/);
  });

  it("records the failure on the run, not on the data", () => {
    const sync = source("src/lib/analytics/sync.ts");

    // Every failure branch reaches for finishSyncRun — the sync run carries the
    // error. Nothing in a failure branch touches analytics_snapshots.
    expect(sync).toMatch(/errorCategory: "token_expired"/);
    expect(sync).toMatch(/finishSyncRun\(client, runId, \{\s*status: "failed"/);

    const failureBranches = sync.split('status: "failed"').slice(1);
    expect(failureBranches.length).toBeGreaterThan(0);
    for (const branch of failureBranches) {
      expect(branch.slice(0, 400)).not.toMatch(/recordSnapshot/);
    }
  });

  it("reports a partial sync as partial rather than as success or loss", () => {
    expect(source("src/lib/analytics/sync.ts")).toMatch(
      /lastError === null \? "succeeded" : written > 0 \? "partial" : "failed"/,
    );
  });
});

describe("a deletion at the platform never rewrites publishing history", () => {
  it("changes only reachability columns when a post has gone", () => {
    const repository = source("src/lib/analytics/repository.ts");
    const marker = repository.slice(
      repository.indexOf("export async function markExternalAvailability"),
    );
    const body = marker.slice(0, marker.indexOf("\n}\n") + 2);

    expect(body).toMatch(/external_availability: availability/);
    expect(body).toMatch(/external_checked_at:/);

    // The three facts a third party must never be able to edit from here.
    expect(body).not.toMatch(/\bstatus:/);
    expect(body).not.toMatch(/\bposted_at:/);
    expect(body).not.toMatch(/\bexternal_post_id:/);
  });

  it("never writes a publish status from anywhere in the analytics layer", () => {
    for (const file of ANALYTICS_LIB) {
      const text = source(file);
      expect(text).not.toMatch(/status: "posted"/);
      expect(text).not.toMatch(/status: "failed_permanent"/);
    }
  });

  it("keeps every snapshot ever taken for a post that has since gone", () => {
    // The unavailable branch marks availability and continues. There is no
    // cleanup of the snapshots that post already produced.
    const sync = source("src/lib/analytics/sync.ts");
    const branch = sync.slice(
      sync.indexOf("if (POST_GONE_ERRORS.includes(result.category))"),
    );

    expect(branch.slice(0, 500)).toMatch(/markExternalAvailability/);
    expect(branch.slice(0, 500)).not.toMatch(/delete|remove|clear/i);
  });
});

describe("the homepage snapshot shows measurements or nothing", () => {
  const homepage = source("src/app/dashboard/page.tsx");

  it("renders totals through the reading formatter rather than raw numbers", () => {
    expect(homepage).toMatch(/formatReading/);
    // The fallback for an absent total is a dash, never a digit.
    expect(homepage).toMatch(/formatReading\(value\) : "—"/);
  });

  it("carries no demo figures, sample series or placeholder percentages", () => {
    const performance = homepage.slice(homepage.indexOf('title="Performance"'));

    expect(performance).not.toMatch(/\bdemo\b/i);
    expect(performance).not.toMatch(/\bsample\b/i);
    expect(performance).not.toMatch(/\bplaceholder\b/i);
    expect(performance).not.toMatch(/\d+%/);
    // No literal metric arrays masquerading as history.
    expect(performance).not.toMatch(/\[\s*\d+\s*,\s*\d+\s*,/);
  });

  it("states freshness beside the figures", () => {
    expect(homepage).toMatch(/describeFreshness\(analytics\.lastFetchedAt\)/);
  });

  it("says nothing has been measured rather than showing zeroes", () => {
    expect(homepage).toMatch(/analytics\.publishedCount === 0/);
  });
});

describe("repurposing suggests and never acts", () => {
  const repurpose = source("src/lib/growth/repurpose.ts");

  it("imports nothing that could approve, schedule or publish", () => {
    expect(repurpose).not.toMatch(/from "@\/lib\/approvals/);
    expect(repurpose).not.toMatch(/from "@\/lib\/schedule/);
    expect(repurpose).not.toMatch(/from "@\/lib\/publishing/);
    expect(repurpose).not.toMatch(/from "@\/lib\/scripture/);
  });

  it("performs no writes at all", () => {
    expect(repurpose).not.toMatch(/supabase|createSupabase|\.from\(/i);
    expect(repurpose).not.toMatch(/"use server"/);
  });

  const winner: WinningPost = {
    post: {
      scheduledPostId: "sp-1",
      platform: "youtube",
      contentItemId: "ci-1",
      externalPostId: "yt-1",
      postedAt: "2026-07-01T09:00:00.000Z",
      topic: "Peace",
      contentType: "teaching",
      variantType: "short",
      durationSeconds: 45,
      title: "Peace that guards",
      thumbnailText: null,
      cta: null,
      scriptureReference: "Philippians 4:7",
      metrics: { views_or_plays: 4200 },
      observationHours: 168,
    },
    percentile: 94,
    metric: "views_or_plays",
    value: 4200,
    comparedAgainst: 14,
    comparisonLabel: "YouTube Shorts",
  };

  it("produces plain data and nothing else, twice over", () => {
    const allPosts: AnalysedPost[] = [winner.post];

    const first = findMissingPlatformCandidates({
      winners: [winner],
      allPosts,
    });
    const second = findMissingPlatformCandidates({
      winners: [winner],
      allPosts,
    });

    // Deterministic, and the inputs are untouched — a suggestion that mutated
    // the post it described would be an action.
    expect(second).toEqual(first);
    expect(allPosts[0]).toEqual(winner.post);
    expect(
      first.every((candidate) => typeof candidate.reason === "string"),
    ).toBe(true);
  });

  it("suggests only the platforms the content never reached", () => {
    const candidates = findMissingPlatformCandidates({
      winners: [winner],
      allPosts: [winner.post],
    });

    expect(candidates.map((candidate) => candidate.suggestedPlatform)).toEqual([
      "instagram",
      "tiktok",
    ]);
    // Never suggests re-posting where it already exists.
    expect(candidates.some((c) => c.suggestedPlatform === "youtube")).toBe(
      false,
    );
  });

  it("carries the evidence into the suggestion instead of asserting it", () => {
    const [candidate] = findMissingPlatformCandidates({
      winners: [winner],
      allPosts: [winner.post],
    });

    expect(candidate.reason).toMatch(/14 comparable posts/);
    expect(candidate.reason).not.toMatch(/will|guarantee|should perform/i);
  });

  it("says the material exists without claiming a short would do well", () => {
    const longForm: AnalysedPost = {
      ...winner.post,
      scheduledPostId: "sp-2",
      contentItemId: "ci-2",
      externalPostId: "yt-2",
      durationSeconds: 1800,
      variantType: "long",
    };

    const [candidate] = findShortsCandidates([longForm]);

    expect(candidate.kind).toBe("long_form_without_short");
    expect(candidate.reason).toMatch(
      /whether a short would perform is untested/,
    );
    expect(candidate.confidence).toBe("early_signal");
  });

  it("needs both performance and a gap before suggesting a topic", () => {
    const strongTopics = [
      { topic: "Peace", confidence: "strong_pattern" as const },
    ];

    expect(
      findTopicGapCandidates({
        strongTopics,
        upcomingByTopic: new Map([["Peace", 6]]),
      }),
    ).toHaveLength(0);

    expect(
      findTopicGapCandidates({
        strongTopics,
        upcomingByTopic: new Map(),
      }),
    ).toHaveLength(1);
  });

  it("offers only a link back to the original in the interface", () => {
    const page = source("src/app/dashboard/growth/page.tsx");
    const section = page.slice(page.indexOf('title="Repurpose"'));

    expect(section).toMatch(
      /dashboard\/content\/\$\{candidate\.contentItemId\}/,
    );
    // No form, no action, no button that does anything but navigate.
    expect(section.slice(0, 2000)).not.toMatch(/<form|formAction|action=\{/);
  });
});

describe("the weekly mission declines rather than pads", () => {
  const empty = {
    findings: [],
    repurposeCandidates: [],
    publishedCount: 0,
    measuredCount: 0,
  };

  it("returns no mission when nothing has been measured", () => {
    expect(buildWeeklyMission(empty)).toBeNull();
    expect(
      buildWeeklyMission({ ...empty, publishedCount: 9, measuredCount: 0 }),
    ).toBeNull();
  });

  it("explains the absence in terms of the record, not with advice", () => {
    expect(missionAbsenceReason(empty)).toMatch(/Nothing has been published/);
    expect(
      missionAbsenceReason({ ...empty, publishedCount: 9, measuredCount: 0 }),
    ).toMatch(/no analytics have been fetched/);

    for (const inputs of [
      empty,
      { ...empty, publishedCount: 9, measuredCount: 0 },
      { ...empty, publishedCount: 9, measuredCount: 4 },
    ]) {
      const reason = missionAbsenceReason(inputs);
      expect(reason).not.toMatch(/try posting|engage|consistency is key/i);
    }
  });

  it("refuses to promote an early signal into a mission", () => {
    const mission = buildWeeklyMission({
      ...empty,
      publishedCount: 4,
      measuredCount: 4,
      repurposeCandidates: [
        {
          kind: "long_form_without_short",
          contentItemId: "ci-9",
          scheduledPostId: "sp-9",
          title: "A long teaching",
          reason: "The material exists.",
          sourcePlatform: "youtube",
          suggestedPlatform: null,
          confidence: "early_signal",
        },
      ],
    });

    expect(mission).toBeNull();
  });

  it("frames an actionable mission as planning, never as publishing", () => {
    const mission = buildWeeklyMission({
      ...empty,
      publishedCount: 20,
      measuredCount: 18,
      repurposeCandidates: [
        {
          kind: "missing_on_platform",
          contentItemId: "ci-1",
          scheduledPostId: "sp-1",
          title: "Peace that guards",
          reason: "Top 6% of YouTube Shorts, against 14 comparable posts.",
          sourcePlatform: "youtube",
          suggestedPlatform: "instagram",
          confidence: "strong_pattern",
        },
      ],
    });

    expect(mission).not.toBeNull();
    expect(mission?.action).toMatch(/^Plan /);
    expect(mission?.action).not.toMatch(/publish|schedule|approve/i);
    expect(mission?.evidence.join(" ")).toMatch(/not from a projection/);
  });
});

describe("Instagram analytics readiness is its own question", () => {
  const instagram = {
    id: "acct-ig",
    owner_id: "owner-1",
    platform: "instagram" as const,
    provider_account_id: "17841400000000000",
    display_name: "Precious Promises",
    handle: "preciouspromises",
    channel_id: null,
    channel_title: null,
    status: "connected" as const,
    granted_scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
    ],
    connected_at: "2026-08-01T00:00:00Z",
    disconnected_at: null,
    token_expires_at: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };

  it("needs no second consent screen, because Meta grants insights with publishing", () => {
    // Instagram carries no extra analytics scope: the publishing connection
    // already covers insights. Demanding a re-consent that does not exist
    // would be as dishonest as inventing a metric.
    const readiness = assessAnalyticsReadiness({
      platform: "instagram",
      account: instagram,
      publishingAuthorised: true,
      runs: [],
    });

    expect(readiness.analyticsAuthorised).toBe(true);
    expect(readiness.missingScopes).toEqual([]);
    // Authorised, but nothing fetched yet — which is not zero either.
    expect(readiness.blockedBy).toBe("not_yet_fetched");
  });

  it("never claims readiness for a platform with no connection", () => {
    const readiness = assessAnalyticsReadiness({
      platform: "instagram",
      account: null,
      publishingAuthorised: false,
      runs: [],
    });

    expect(readiness.analyticsAuthorised).toBe(false);
    expect(readiness.blockedBy).toBe("platform_not_connected");
  });

  it("does not read a YouTube re-consent requirement onto Instagram", () => {
    const readiness = assessAnalyticsReadiness({
      platform: "instagram",
      account: instagram,
      publishingAuthorised: true,
      runs: [],
    });

    expect(readiness.blockedBy).not.toBe("analytics_permission_missing");
  });
});
