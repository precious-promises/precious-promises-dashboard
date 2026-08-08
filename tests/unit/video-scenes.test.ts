import { describe, expect, it } from "vitest";

import {
  canSplitScene,
  clampDuration,
  formatDuration,
  isValidDuration,
  MAX_SCENE_SECONDS,
  MIN_SCENE_SECONDS,
  moveScene,
  nextSceneOrder,
  normaliseOrder,
  removeScene,
  sceneStartTimes,
  splitDurations,
  totalDuration,
  trimScene,
  type OrderedScene,
} from "@/lib/video/scenes";

/**
 * Scene list arithmetic.
 *
 * `scene_order` is unique per project in the database, so a gap or a duplicate
 * is not a cosmetic problem — it is a failed write. Every operation here
 * renumbers, and these tests are what hold that guarantee.
 */

function scene(id: string, order: number, duration = 5): OrderedScene {
  return { id, scene_order: order, duration_seconds: duration };
}

const THREE = [scene("a", 1), scene("b", 2), scene("c", 3)];

describe("normaliseOrder", () => {
  it("renumbers from 1 with no gaps", () => {
    const result = normaliseOrder([
      scene("a", 4),
      scene("b", 9),
      scene("c", 2),
    ]);

    expect(result.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(result.map((item) => item.scene_order)).toEqual([1, 2, 3]);
  });

  it("leaves an already-ordered list alone", () => {
    expect(normaliseOrder(THREE).map((item) => item.scene_order)).toEqual([
      1, 2, 3,
    ]);
  });

  it("does not mutate its input", () => {
    const input = [scene("a", 7)];
    normaliseOrder(input);

    expect(input[0]!.scene_order).toBe(7);
  });
});

describe("moveScene", () => {
  it("moves a scene earlier", () => {
    const result = moveScene(THREE, "c", "up");

    expect(result.map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(result.map((item) => item.scene_order)).toEqual([1, 2, 3]);
  });

  it("moves a scene later", () => {
    expect(moveScene(THREE, "a", "down").map((item) => item.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("is a no-op at the ends rather than an error", () => {
    // The editor disables these controls; a click racing the disabled state
    // should do nothing, not throw.
    expect(moveScene(THREE, "a", "up").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(moveScene(THREE, "c", "down").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores an unknown scene", () => {
    expect(moveScene(THREE, "missing", "up").map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("removeScene", () => {
  it("closes the gap left behind", () => {
    const result = removeScene(THREE, "b");

    expect(result.map((item) => item.id)).toEqual(["a", "c"]);
    expect(result.map((item) => item.scene_order)).toEqual([1, 2]);
  });

  it("handles removing the only scene", () => {
    expect(removeScene([scene("a", 1)], "a")).toEqual([]);
  });
});

describe("nextSceneOrder", () => {
  it("starts at 1 for an empty project", () => {
    expect(nextSceneOrder([])).toBe(1);
  });

  it("appends after the highest order, not the count", () => {
    // A list whose numbering has drifted must still append somewhere free.
    expect(nextSceneOrder([{ scene_order: 1 }, { scene_order: 7 }])).toBe(8);
  });
});

describe("duration handling", () => {
  it("clamps below the minimum and above the maximum", () => {
    expect(clampDuration(0.1)).toBe(MIN_SCENE_SECONDS);
    expect(clampDuration(9999)).toBe(MAX_SCENE_SECONDS);
  });

  it("rounds to hundredths so the timeline and the store agree", () => {
    expect(clampDuration(4.499999)).toBe(4.5);
  });

  it("treats a non-number as the minimum", () => {
    expect(clampDuration(Number.NaN)).toBe(MIN_SCENE_SECONDS);
  });

  it("validates the allowed range", () => {
    expect(isValidDuration(MIN_SCENE_SECONDS)).toBe(true);
    expect(isValidDuration(MAX_SCENE_SECONDS)).toBe(true);
    expect(isValidDuration(0)).toBe(false);
    expect(isValidDuration(MAX_SCENE_SECONDS + 0.01)).toBe(false);
    expect(isValidDuration(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("trims one scene and leaves the rest", () => {
    const result = trimScene(THREE, "b", 2.25);

    expect(result.find((item) => item.id === "b")?.duration_seconds).toBe(2.25);
    expect(result.find((item) => item.id === "a")?.duration_seconds).toBe(5);
  });

  it("clamps a trim rather than storing an illegal value", () => {
    expect(
      trimScene(THREE, "b", 0).find((item) => item.id === "b")
        ?.duration_seconds,
    ).toBe(MIN_SCENE_SECONDS);
  });

  it("totals the composition", () => {
    expect(
      totalDuration([{ duration_seconds: 2.5 }, { duration_seconds: 3 }]),
    ).toBe(5.5);
    expect(totalDuration([])).toBe(0);
  });
});

describe("splitting", () => {
  it("refuses to split a scene that cannot make two legal halves", () => {
    expect(canSplitScene(MIN_SCENE_SECONDS)).toBe(false);
    expect(splitDurations(MIN_SCENE_SECONDS)).toBeNull();
  });

  it("splits into halves that both clear the minimum", () => {
    const halves = splitDurations(5);

    expect(halves).not.toBeNull();
    for (const half of halves!) {
      expect(half).toBeGreaterThanOrEqual(MIN_SCENE_SECONDS);
    }
  });

  it("preserves the total length", () => {
    const halves = splitDurations(7.5)!;

    expect(halves[0] + halves[1]).toBeCloseTo(7.5, 5);
  });
});

describe("sceneStartTimes", () => {
  it("accumulates start times in order", () => {
    const result = sceneStartTimes([
      scene("a", 1, 3),
      scene("b", 2, 4.5),
      scene("c", 3, 2),
    ]);

    expect(result.map((item) => item.startsAt)).toEqual([0, 3, 7.5]);
  });

  it("orders before accumulating", () => {
    const result = sceneStartTimes([scene("b", 2, 4), scene("a", 1, 1)]);

    expect(result.map((item) => item.scene.id)).toEqual(["a", "b"]);
    expect(result.map((item) => item.startsAt)).toEqual([0, 1]);
  });
});

describe("formatDuration", () => {
  it("renders minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(64)).toBe("1:04");
    expect(formatDuration(600)).toBe("10:00");
  });

  it("treats nonsense as zero rather than rendering NaN", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
