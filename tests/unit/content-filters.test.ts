// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  escapeLikePattern,
  hasActiveFilters,
  parseContentFilters,
} from "@/lib/content/filters";

describe("parseContentFilters", () => {
  it("returns empty filters for an empty query", () => {
    expect(parseContentFilters({})).toEqual(EMPTY_FILTERS);
  });

  it("reads every supported filter", () => {
    const filters = parseContentFilters({
      q: " peace ",
      type: "youtube_short",
      topic: " Provision ",
      status: "draft",
      verification: "manually_verified",
    });

    expect(filters).toEqual({
      search: "peace",
      contentType: "youtube_short",
      topic: "Provision",
      status: "draft",
      verification: "manually_verified",
    });
  });

  it("drops values outside the known vocabulary", () => {
    // An unrecognised value must not reach a query.
    const filters = parseContentFilters({
      type: "podcast",
      status: "published",
      verification: "blessed",
    });

    expect(filters.contentType).toBeNull();
    expect(filters.status).toBeNull();
    expect(filters.verification).toBeNull();
  });

  it("takes the first value when a param repeats", () => {
    expect(parseContentFilters({ status: ["draft", "archived"] }).status).toBe(
      "draft",
    );
  });

  it("caps the length of free-text filters", () => {
    expect(parseContentFilters({ q: "x".repeat(500) }).search).toHaveLength(
      120,
    );
  });
});

describe("hasActiveFilters", () => {
  it("is false when nothing is set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("is true when any single filter is set", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, search: "peace" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, status: "draft" })).toBe(true);
    expect(
      hasActiveFilters({ ...EMPTY_FILTERS, contentType: "tiktok_video" }),
    ).toBe(true);
  });
});

describe("escapeLikePattern", () => {
  it("escapes wildcards so a search cannot silently widen", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
  });

  it("escapes the characters PostgREST parses structurally", () => {
    // A comma or bracket in a search term would otherwise break out of the
    // or=(...) list and change which rows are matched.
    expect(escapeLikePattern("a,b")).toBe("a\\,b");
    expect(escapeLikePattern("(x)")).toBe("\\(x\\)");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeLikePattern("2 Peter 1:4")).toBe("2 Peter 1:4");
  });
});
