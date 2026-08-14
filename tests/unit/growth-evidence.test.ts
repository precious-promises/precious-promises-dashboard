// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  analyseGrouping,
  byTimeBand,
  byTitleStyle,
  byTopic,
  byWeekday,
  comparisonKey,
  comparisonSets,
  durationBand,
  findWinners,
  isWinner,
  normalisePillar,
  titlePattern,
  type AnalysedPost,
} from "@/lib/growth/analysis";
import {
  assessConfidence,
  consistencyOf,
  describeFinding,
  isActionable,
  MINIMUM_COMPARABLE_POSTS,
} from "@/lib/growth/confidence";
import { buildWeeklyMission, missionAbsenceReason } from "@/lib/growth/mission";
import {
  findMissingPlatformCandidates,
  findShortsCandidates,
} from "@/lib/growth/repurpose";

/**
 * Growth findings, and the discipline about evidence.
 *
 * The Growth Centre is an evidence surface, not an oracle. These tests hold it
 * to three things:
 *
 * 1. **Nothing is claimed from too little data.** A finding over two posts is
 *    not a weak finding — it is the absence of one.
 * 2. **Nothing is compared across categories.** A two-hour teaching and a
 *    thirty-second Short never rank against each other.
 * 3. **Nothing claims causation.** Every phrase describes what the observed
 *    posts did, never why.
 */

const NOW = new Date("2026-08-12T12:00:00Z");

function post(overrides: Partial<AnalysedPost> = {}): AnalysedPost {
  return {
    scheduledPostId: "post-1",
    platform: "youtube",
    contentItemId: "item-1",
    externalPostId: "vid-1",
    postedAt: new Date(NOW.getTime() - 10 * 86_400_000).toISOString(),
    topic: "Peace",
    contentType: "youtube_short",
    variantType: "youtube_short",
    durationSeconds: 45,
    title: "A promise of peace",
    thumbnailText: null,
    cta: null,
    scriptureReference: "John 14:27",
    metrics: { views_or_plays: 100 },
    observationHours: 240,
    ...overrides,
  };
}

/** A set of posts differing only in topic and views. */
function peaceAndFaith(peaceViews: number[], faithViews: number[]) {
  return [
    ...peaceViews.map((views, index) =>
      post({
        scheduledPostId: `peace-${index}`,
        externalPostId: `peace-${index}`,
        contentItemId: `item-peace-${index}`,
        topic: "Peace",
        metrics: { views_or_plays: views },
      }),
    ),
    ...faithViews.map((views, index) =>
      post({
        scheduledPostId: `faith-${index}`,
        externalPostId: `faith-${index}`,
        contentItemId: `item-faith-${index}`,
        topic: "Faith",
        metrics: { views_or_plays: views },
      }),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe("confidence never overstates the evidence", () => {
  it("refuses to say anything below the minimum comparable posts", () => {
    const result = assessConfidence({
      comparablePosts: 2,
      postsWithMetric: 2,
      youngestObservationHours: 500,
      consistency: 1,
    });

    // Perfectly consistent over two posts is still two posts.
    expect(result.level).toBe("insufficient_data");
    expect(result.reasons[0]).toMatch(/at least 3/);
  });

  it("refuses a group whose newest post has not finished performing", () => {
    const result = assessConfidence({
      comparablePosts: 20,
      postsWithMetric: 20,
      youngestObservationHours: 3,
      consistency: 1,
    });

    expect(result.level).toBe("insufficient_data");
    expect(result.reasons[0]).toMatch(/hours old/);
  });

  it("caps at early signal when metric coverage is thin", () => {
    const result = assessConfidence({
      comparablePosts: 20,
      postsWithMetric: 8,
      youngestObservationHours: 500,
      consistency: 1,
    });

    expect(result.level).toBe("early_signal");
  });

  it("caps at early signal when posts do not move together", () => {
    const result = assessConfidence({
      comparablePosts: 20,
      postsWithMetric: 20,
      youngestObservationHours: 500,
      consistency: 0.5,
    });

    expect(result.level).toBe("early_signal");
  });

  it("reaches a strong pattern only with volume and consistency", () => {
    const result = assessConfidence({
      comparablePosts: 20,
      postsWithMetric: 18,
      youngestObservationHours: 500,
      consistency: 0.9,
    });

    expect(result.level).toBe("strong_pattern");
  });

  it("only treats the top two levels as actionable", () => {
    expect(isActionable("strong_pattern")).toBe(true);
    expect(isActionable("moderate_evidence")).toBe(true);
    expect(isActionable("early_signal")).toBe(false);
    expect(isActionable("insufficient_data")).toBe(false);
  });

  it("measures consistency as agreement with the group's direction", () => {
    expect(consistencyOf([10, 12, 14], 5)).toBe(1);
    expect(consistencyOf([10, 2, 14, 1], 5)).toBe(0.5);
    // An empty set has no consistency, rather than perfect consistency over
    // nothing.
    expect(consistencyOf([], 5)).toBe(0);
  });
});

describe("findings describe, they never explain", () => {
  it("phrases a result as observation rather than cause", () => {
    const sentence = describeFinding({
      groupLabel: "Peace",
      metricLabel: "views",
      direction: "higher",
      differencePercent: 40,
      level: "strong_pattern",
    });

    expect(sentence).toMatch(/have recorded/);
    expect(sentence).toMatch(/in the observed data/);
    // The words that would turn a description into a claim.
    expect(sentence).not.toMatch(/\bcause|\bbecause|\bdrives|\bleads to/i);
  });

  it("says nothing at all when the data is insufficient", () => {
    const sentence = describeFinding({
      groupLabel: "Peace",
      metricLabel: "views",
      direction: "higher",
      differencePercent: 400,
      level: "insufficient_data",
    });

    expect(sentence).toMatch(/Not enough/);
    expect(sentence).not.toMatch(/400/);
  });
});

// ---------------------------------------------------------------------------
// Comparison sets
// ---------------------------------------------------------------------------

describe("only comparable content is compared", () => {
  it("bands duration without claiming an algorithm prefers any of them", () => {
    expect(durationBand(30)).toBe("short");
    expect(durationBand(300)).toBe("medium");
    expect(durationBand(7200)).toBe("long");
    expect(durationBand(null)).toBe("unknown");
  });

  it("never puts a long-form video in the same set as a Short", () => {
    const short = post({ durationSeconds: 30 });
    const long = post({ durationSeconds: 7200 });

    expect(comparisonKey(short)).not.toBe(comparisonKey(long));
  });

  it("never puts two platforms in the same set", () => {
    const yt = post({ platform: "youtube", durationSeconds: 30 });
    const ig = post({ platform: "instagram", durationSeconds: 30 });

    expect(comparisonKey(yt)).not.toBe(comparisonKey(ig));
  });

  it("groups posts into sets by platform and length", () => {
    const sets = comparisonSets([
      post({ platform: "youtube", durationSeconds: 30 }),
      post({ platform: "youtube", durationSeconds: 45 }),
      post({ platform: "youtube", durationSeconds: 7200 }),
      post({ platform: "instagram", durationSeconds: 30 }),
    ]);

    expect(sets.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

describe("topics come from stored metadata, never from Scripture", () => {
  it("gives a known pillar its canonical casing", () => {
    expect(normalisePillar("peace")).toBe("Peace");
    expect(normalisePillar("HEALING")).toBe("Healing");
  });

  it("keeps an unrecognised topic exactly as the owner typed it", () => {
    // Nothing reclassifies content, and nothing infers a topic from a verse.
    expect(normalisePillar("Midweek encouragement")).toBe(
      "Midweek encouragement",
    );
  });

  it("excludes a post with no topic rather than guessing one", () => {
    expect(byTopic(post({ topic: null }))).toBeNull();
    expect(byTopic(post({ topic: "   " }))).toBeNull();
  });

  it("finds a topic difference once there are enough posts", () => {
    const findings = analyseGrouping({
      posts: peaceAndFaith(
        [200, 210, 190, 205, 195, 200],
        [100, 110, 90, 105, 95, 100],
      ),
      metric: "views_or_plays",
      groupBy: byTopic,
      now: NOW,
    });

    const peace = findings.find((finding) => finding.groupKey === "Peace");

    expect(peace).toBeDefined();
    expect(peace!.differencePercent).toBeGreaterThan(90);
    expect(isActionable(peace!.confidence.level)).toBe(true);
  });

  it("says insufficient data when a topic has too few posts", () => {
    const findings = analyseGrouping({
      posts: peaceAndFaith([200], [100, 110, 90, 105]),
      metric: "views_or_plays",
      groupBy: byTopic,
      now: NOW,
    });

    const peace = findings.find((finding) => finding.groupKey === "Peace");
    expect(peace!.confidence.level).toBe("insufficient_data");
  });
});

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

describe("posting time is analysed in the owner's timezone", () => {
  it("attributes a late-evening London post to the London day", () => {
    // 23:30 London on 11 August is 22:30 UTC the same day; a naive UTC read of
    // a later post would move it to Wednesday.
    const londonTuesday = post({
      postedAt: "2026-08-11T22:30:00Z",
    });

    const group = byWeekday("Europe/London")(londonTuesday);
    expect(group?.label).toBe("Tuesday");
  });

  it("bands local time", () => {
    const evening = post({ postedAt: "2026-08-11T18:30:00Z" });
    const group = byTimeBand("Europe/London")(evening);

    expect(group?.key).toBe("evening");
  });

  it("excludes a post that was never published", () => {
    expect(byWeekday()(post({ postedAt: null }))).toBeNull();
    expect(byTimeBand()(post({ postedAt: null }))).toBeNull();
  });

  it("refuses a best-time finding from one or two posts", () => {
    const findings = analyseGrouping({
      posts: [
        post({ scheduledPostId: "a", postedAt: "2026-08-04T19:00:00Z" }),
        post({ scheduledPostId: "b", postedAt: "2026-08-05T09:00:00Z" }),
        post({ scheduledPostId: "c", postedAt: "2026-08-06T14:00:00Z" }),
      ],
      metric: "views_or_plays",
      groupBy: byTimeBand("Europe/London"),
      now: NOW,
    });

    for (const finding of findings) {
      expect(finding.confidence.level).toBe("insufficient_data");
    }
  });
});

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

describe("title patterns are deterministic, never judgements", () => {
  it("detects a question by its punctuation", () => {
    expect(titlePattern("Where is God when it hurts?")?.isQuestion).toBe(true);
    expect(titlePattern("God is near when it hurts")?.isQuestion).toBe(false);
  });

  it("detects a Scripture reference without parsing the verse", () => {
    expect(
      titlePattern("A promise from John 14:27")?.containsScriptureReference,
    ).toBe(true);
    expect(
      titlePattern("A promise for today")?.containsScriptureReference,
    ).toBe(false);
  });

  it("bands title length", () => {
    expect(titlePattern("Short one")?.lengthBand).toBe("short");
    expect(titlePattern("x".repeat(100))?.lengthBand).toBe("long");
  });

  it("excludes a variant with no title", () => {
    expect(byTitleStyle(post({ title: null }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Winners
// ---------------------------------------------------------------------------

describe("winners are ranked within their own set", () => {
  it("produces no winners below the minimum set size", () => {
    const winners = findWinners({
      posts: [post({ scheduledPostId: "a" }), post({ scheduledPostId: "b" })],
      metric: "views_or_plays",
    });

    // Declaring the best of two posts is picking, not measuring.
    expect(winners).toEqual([]);
    expect(MINIMUM_COMPARABLE_POSTS).toBe(3);
  });

  it("ranks by percentile within the comparison set", () => {
    const winners = findWinners({
      posts: [
        post({ scheduledPostId: "a", metrics: { views_or_plays: 10 } }),
        post({ scheduledPostId: "b", metrics: { views_or_plays: 50 } }),
        post({ scheduledPostId: "c", metrics: { views_or_plays: 100 } }),
      ],
      metric: "views_or_plays",
    });

    expect(winners[0].post.scheduledPostId).toBe("c");
    expect(winners[0].percentile).toBe(100);
    expect(winners[0].comparedAgainst).toBe(3);
  });

  it("never ranks a Short against a long-form video", () => {
    const winners = findWinners({
      posts: [
        post({
          scheduledPostId: "s1",
          durationSeconds: 30,
          metrics: { views_or_plays: 10 },
        }),
        post({
          scheduledPostId: "s2",
          durationSeconds: 30,
          metrics: { views_or_plays: 20 },
        }),
        post({
          scheduledPostId: "s3",
          durationSeconds: 30,
          metrics: { views_or_plays: 30 },
        }),
        post({
          scheduledPostId: "l1",
          durationSeconds: 7200,
          metrics: { views_or_plays: 5 },
        }),
      ],
      metric: "views_or_plays",
    });

    // The long-form post is alone in its set, so it is not ranked at all
    // rather than appearing last against a different medium.
    expect(winners.map((w) => w.post.scheduledPostId)).not.toContain("l1");
  });

  it("skips a post the metric was never measured for", () => {
    const winners = findWinners({
      posts: [
        post({ scheduledPostId: "a", metrics: { views_or_plays: 10 } }),
        post({ scheduledPostId: "b", metrics: { views_or_plays: 20 } }),
        post({ scheduledPostId: "c", metrics: { views_or_plays: 30 } }),
        post({ scheduledPostId: "unmeasured", metrics: {} }),
      ],
      metric: "views_or_plays",
    });

    // Unmeasured is not last place. It is absent.
    expect(winners.map((w) => w.post.scheduledPostId)).not.toContain(
      "unmeasured",
    );
  });

  it("treats only the top quartile as a standout", () => {
    expect(isWinner({ percentile: 80 } as never)).toBe(true);
    expect(isWinner({ percentile: 50 } as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Repurpose
// ---------------------------------------------------------------------------

describe("repurpose suggestions are planning actions only", () => {
  it("suggests a platform a winning item never reached", () => {
    const posts = [
      post({
        scheduledPostId: "a",
        contentItemId: "item-a",
        metrics: { views_or_plays: 10 },
      }),
      post({
        scheduledPostId: "b",
        contentItemId: "item-b",
        metrics: { views_or_plays: 20 },
      }),
      post({
        scheduledPostId: "c",
        contentItemId: "item-c",
        metrics: { views_or_plays: 300 },
      }),
    ];

    const winners = findWinners({ posts, metric: "views_or_plays" });
    const candidates = findMissingPlatformCandidates({
      winners,
      allPosts: posts,
      platforms: ["instagram"],
    });

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].suggestedPlatform).toBe("instagram");
    expect(candidates[0].reason).toMatch(/comparable posts/);
  });

  it("does not suggest a platform the item already reached", () => {
    const posts = [
      post({
        scheduledPostId: "a",
        contentItemId: "shared",
        platform: "youtube",
        metrics: { views_or_plays: 300 },
      }),
      post({
        scheduledPostId: "b",
        contentItemId: "shared",
        platform: "instagram",
        metrics: { views_or_plays: 300 },
      }),
      post({
        scheduledPostId: "c",
        contentItemId: "other",
        metrics: { views_or_plays: 10 },
      }),
      post({
        scheduledPostId: "d",
        contentItemId: "other2",
        metrics: { views_or_plays: 20 },
      }),
    ];

    const winners = findWinners({ posts, metric: "views_or_plays" });
    const candidates = findMissingPlatformCandidates({
      winners,
      allPosts: posts,
      platforms: ["youtube", "instagram"],
    });

    for (const candidate of candidates) {
      expect(
        candidate.contentItemId === "shared" &&
          candidate.suggestedPlatform === "instagram",
      ).toBe(false);
    }
  });

  it("finds long-form with no short cut from it", () => {
    const candidates = findShortsCandidates([
      post({
        scheduledPostId: "long",
        contentItemId: "item-long",
        durationSeconds: 3600,
      }),
    ]);

    expect(candidates).toHaveLength(1);
    // A structural observation, not a performance claim.
    expect(candidates[0].confidence).toBe("early_signal");
    expect(candidates[0].reason).toMatch(/untested/);
  });

  it("does not suggest a short when one already exists", () => {
    const candidates = findShortsCandidates([
      post({
        scheduledPostId: "long",
        contentItemId: "shared",
        durationSeconds: 3600,
      }),
      post({
        scheduledPostId: "short",
        contentItemId: "shared",
        durationSeconds: 40,
      }),
    ]);

    expect(candidates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The weekly mission
// ---------------------------------------------------------------------------

describe("the weekly mission is never invented", () => {
  const emptyInputs = {
    findings: [],
    repurposeCandidates: [],
    publishedCount: 0,
    measuredCount: 0,
  };

  it("returns nothing when nothing has been published", () => {
    expect(buildWeeklyMission(emptyInputs)).toBeNull();
    expect(missionAbsenceReason(emptyInputs)).toMatch(
      /Nothing has been published/,
    );
  });

  it("returns nothing when posts exist but none are measured", () => {
    const inputs = { ...emptyInputs, publishedCount: 12 };

    expect(buildWeeklyMission(inputs)).toBeNull();
    expect(missionAbsenceReason(inputs)).toMatch(
      /no analytics have been fetched/,
    );
  });

  it("returns nothing when the evidence is only an early signal", () => {
    const inputs = {
      findings: [
        {
          groupKey: "Peace",
          groupLabel: "Peace",
          postCount: 4,
          measuredCount: 4,
          groupMean: 200,
          baselineMean: 100,
          differencePercent: 100,
          confidence: {
            level: "early_signal" as const,
            reasons: [],
            basis: {
              comparablePosts: 4,
              postsWithMetric: 4,
              youngestObservationHours: 100,
              consistency: 0.7,
            },
          },
          headline: "…",
        },
      ],
      repurposeCandidates: [],
      publishedCount: 10,
      measuredCount: 8,
    };

    // Promoting an early signal to a mission is how a dashboard teaches its
    // owner to stop believing it.
    expect(buildWeeklyMission(inputs)).toBeNull();
    expect(missionAbsenceReason(inputs)).toMatch(
      /no pattern yet strong enough/,
    );
  });

  it("builds a mission from an actionable finding, with its evidence", () => {
    const inputs = {
      findings: [
        {
          groupKey: "Peace",
          groupLabel: "Peace",
          postCount: 14,
          measuredCount: 13,
          groupMean: 200,
          baselineMean: 100,
          differencePercent: 100,
          confidence: {
            level: "strong_pattern" as const,
            reasons: ["13 comparable posts, 90% moving in the same direction."],
            basis: {
              comparablePosts: 14,
              postsWithMetric: 13,
              youngestObservationHours: 400,
              consistency: 0.9,
            },
          },
          headline:
            "Posts in Peace have recorded 100% higher views than the rest in the observed data.",
        },
      ],
      repurposeCandidates: [],
      publishedCount: 30,
      measuredCount: 28,
    };

    const mission = buildWeeklyMission(inputs);

    expect(mission).not.toBeNull();
    expect(mission!.action).toMatch(/Peace/);
    expect(mission!.confidence).toBe("strong_pattern");
    // The evidence travels with the recommendation.
    expect(mission!.evidence.join(" ")).toMatch(/13 of 14|13 comparable/);
    expect(mission!.evidence.join(" ")).toMatch(/not a claim about cause/);
  });

  it("is deterministic — the same inputs give the same mission", () => {
    const inputs = {
      findings: [],
      repurposeCandidates: [
        {
          kind: "missing_on_platform" as const,
          contentItemId: "item-1",
          scheduledPostId: "post-1",
          title: "A promise of peace",
          reason: "Top 10% of youtube · Under 1 minute.",
          sourcePlatform: "youtube" as const,
          suggestedPlatform: "instagram" as const,
          confidence: "strong_pattern" as const,
        },
      ],
      publishedCount: 20,
      measuredCount: 18,
    };

    expect(buildWeeklyMission(inputs)).toEqual(buildWeeklyMission(inputs));
  });
});
