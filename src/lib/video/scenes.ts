import type { VideoScene } from "./types";

/**
 * Scene list arithmetic.
 *
 * Pure functions over an ordered scene list, so ordering, trimming and
 * splitting can be tested exhaustively without a database and without a
 * browser. The server actions apply whatever these return.
 *
 * `scene_order` is 1-based and contiguous. Every operation here re-normalises,
 * because a gap in the sequence would later be indistinguishable from a scene
 * that failed to save.
 */

export const MIN_SCENE_SECONDS = 0.5;
export const MAX_SCENE_SECONDS = 600;

/** A scene as far as ordering is concerned. */
export type OrderedScene = Pick<
  VideoScene,
  "id" | "scene_order" | "duration_seconds"
>;

/**
 * Copy a scene with one field replaced.
 *
 * The single cast in this module. Spreading a generic `T` produces
 * `T & { … }`, which TypeScript will not accept as `T` even though every
 * property is preserved; the alternative is dropping the generic and forcing
 * callers to hold full rows.
 */
function withField<T extends OrderedScene, K extends keyof OrderedScene>(
  scene: T,
  key: K,
  value: OrderedScene[K],
): T {
  return { ...scene, [key]: value } as T;
}

/** Sorted by order, then renumbered 1..n. */
export function normaliseOrder<T extends OrderedScene>(scenes: T[]): T[] {
  return [...scenes]
    .sort((a, b) => a.scene_order - b.scene_order)
    .map((scene, index) => withField(scene, "scene_order", index + 1));
}

/**
 * Move one scene up or down by a single position.
 *
 * Moving the first scene up, or the last down, returns the list unchanged
 * rather than throwing: the editor renders those controls as disabled, and a
 * double-click racing the disabled state should be a no-op, not an error.
 */
export function moveScene<T extends OrderedScene>(
  scenes: T[],
  sceneId: string,
  direction: "up" | "down",
): T[] {
  const ordered = normaliseOrder(scenes);
  const index = ordered.findIndex((scene) => scene.id === sceneId);
  if (index === -1) {
    return ordered;
  }

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) {
    return ordered;
  }

  const swapped = [...ordered];
  const a = swapped[index]!;
  const b = swapped[target]!;
  swapped[index] = b;
  swapped[target] = a;

  // Renumber by array position rather than calling normaliseOrder: the swapped
  // rows still carry their old scene_order, so sorting by it would put them
  // straight back where they were.
  return swapped.map((scene, position) =>
    withField(scene, "scene_order", position + 1),
  );
}

/** Remove a scene and close the gap. */
export function removeScene<T extends OrderedScene>(
  scenes: T[],
  sceneId: string,
): T[] {
  return normaliseOrder(scenes.filter((scene) => scene.id !== sceneId));
}

/** The order a newly appended scene should take. */
export function nextSceneOrder(
  scenes: Pick<VideoScene, "scene_order">[],
): number {
  if (scenes.length === 0) {
    return 1;
  }
  return Math.max(...scenes.map((scene) => scene.scene_order)) + 1;
}

/**
 * Clamp a duration into the allowed range, rounded to hundredths.
 *
 * Rounding here rather than at the database boundary keeps the value the
 * editor displays identical to the value that is stored — a scene that shows
 * 4.5s and stores 4.499999 would make the timeline disagree with itself.
 */
export function clampDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return MIN_SCENE_SECONDS;
  }
  const bounded = Math.min(
    Math.max(seconds, MIN_SCENE_SECONDS),
    MAX_SCENE_SECONDS,
  );
  return Math.round(bounded * 100) / 100;
}

/** True when a duration is inside the allowed range. */
export function isValidDuration(seconds: number): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds >= MIN_SCENE_SECONDS &&
    seconds <= MAX_SCENE_SECONDS
  );
}

/**
 * Trim a scene to a new length.
 *
 * "Trim" in this editor means changing how long a scene is on screen. It does
 * not cut a media file: the studio holds references to assets it does not own
 * the bytes of, and no transcoding exists.
 */
export function trimScene<T extends OrderedScene>(
  scenes: T[],
  sceneId: string,
  seconds: number,
): T[] {
  return normaliseOrder(
    scenes.map((scene) =>
      scene.id === sceneId
        ? withField(scene, "duration_seconds", clampDuration(seconds))
        : scene,
    ),
  );
}

/**
 * Whether a scene is long enough to be split into two.
 *
 * Both halves must still clear the minimum, so a 0.6s scene cannot be split
 * into two 0.3s scenes that the database would reject.
 */
export function canSplitScene(durationSeconds: number): boolean {
  return durationSeconds >= MIN_SCENE_SECONDS * 2;
}

/**
 * The two durations a split produces.
 *
 * Returns `null` when the scene is too short, so the caller has to handle the
 * refusal rather than receive a silently invalid pair.
 */
export function splitDurations(
  durationSeconds: number,
): [number, number] | null {
  if (!canSplitScene(durationSeconds)) {
    return null;
  }
  const first = clampDuration(durationSeconds / 2);
  const second = clampDuration(durationSeconds - first);
  return [first, second];
}

/** Total composition length, rounded to hundredths. */
export function totalDuration(
  scenes: Pick<VideoScene, "duration_seconds">[],
): number {
  const total = scenes.reduce(
    (sum, scene) =>
      sum +
      (Number.isFinite(scene.duration_seconds) ? scene.duration_seconds : 0),
    0,
  );
  return Math.round(total * 100) / 100;
}

/** The moment each scene starts, in order. */
export function sceneStartTimes<T extends OrderedScene>(
  scenes: T[],
): { scene: T; startsAt: number }[] {
  let elapsed = 0;
  return normaliseOrder(scenes).map((scene) => {
    const startsAt = Math.round(elapsed * 100) / 100;
    elapsed += scene.duration_seconds;
    return { scene, startsAt };
  });
}

/** `1:04` style, for the timeline. */
export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const whole = Math.floor(safe);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
