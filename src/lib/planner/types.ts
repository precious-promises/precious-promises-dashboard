import type { VariantPlatform } from "@/lib/variants/types";

/**
 * The Content Planner vocabulary.
 *
 * **A planner item is not a scheduled post.** It records intent — what Dave
 * wants to make, roughly when, for where — and nothing in this module or its
 * tables touches scheduling. The bridge to reality is `content_item_id`:
 * an item moves to `in_production` by being linked to actual content, and
 * that content then walks the ordinary produce → approve → schedule path.
 */

export const PLANNER_STATUSES = [
  "idea",
  "planned",
  "in_production",
  "done",
  "dropped",
] as const;
export type PlannerStatus = (typeof PLANNER_STATUSES)[number];

export const PLANNER_STATUS_LABELS: Record<PlannerStatus, string> = {
  idea: "Idea",
  planned: "Planned",
  in_production: "In production",
  done: "Done",
  dropped: "Dropped",
};

export const PLANNER_PRIORITIES = ["low", "normal", "high"] as const;
export type PlannerPriority = (typeof PLANNER_PRIORITIES)[number];

export const PLANNER_PRIORITY_LABELS: Record<PlannerPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** Statuses that still represent live intent. */
export const OPEN_PLANNER_STATUSES: readonly PlannerStatus[] = [
  "idea",
  "planned",
  "in_production",
];

export interface PlannerItem {
  id: string;
  owner_id: string;
  title: string;
  topic: string | null;
  content_type: string | null;
  target_platforms: VariantPlatform[];
  target_date: string | null;
  priority: PlannerPriority;
  status: PlannerStatus;
  series: string | null;
  notes: string | null;
  content_item_id: string | null;
  created_at: string;
  updated_at: string;
}

/** The planner's views, all derived from one list. Pure. */
export interface PlannerViews {
  backlog: PlannerItem[];
  thisWeek: PlannerItem[];
  upcoming: PlannerItem[];
  byTopic: Map<string, PlannerItem[]>;
  byPlatform: Map<VariantPlatform, PlannerItem[]>;
  closed: PlannerItem[];
}

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function buildPlannerViews(
  items: readonly PlannerItem[],
  now: Date = new Date(),
): PlannerViews {
  const today = startOfDay(now);
  const weekEnd = today + 7 * 86_400_000;

  const open = items.filter((item) =>
    OPEN_PLANNER_STATUSES.includes(item.status),
  );

  const backlog = open.filter((item) => item.target_date === null);

  const dated = open.filter(
    (item): item is PlannerItem & { target_date: string } =>
      item.target_date !== null,
  );

  const thisWeek = dated.filter((item) => {
    const when = Date.parse(item.target_date);
    return !Number.isNaN(when) && when >= today && when < weekEnd;
  });

  const upcoming = dated.filter((item) => {
    const when = Date.parse(item.target_date);
    return !Number.isNaN(when) && when >= weekEnd;
  });

  const byTopic = new Map<string, PlannerItem[]>();
  for (const item of open) {
    const topic = (item.topic ?? "").trim();
    if (topic === "") continue;
    const list = byTopic.get(topic) ?? [];
    list.push(item);
    byTopic.set(topic, list);
  }

  const byPlatform = new Map<VariantPlatform, PlannerItem[]>();
  for (const item of open) {
    for (const platform of item.target_platforms) {
      const list = byPlatform.get(platform) ?? [];
      list.push(item);
      byPlatform.set(platform, list);
    }
  }

  const closed = items.filter(
    (item) => !OPEN_PLANNER_STATUSES.includes(item.status),
  );

  return { backlog, thisWeek, upcoming, byTopic, byPlatform, closed };
}

/** How many open planned items cover each topic — the gap-check input. */
export function openTopicCounts(
  items: readonly PlannerItem[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!OPEN_PLANNER_STATUSES.includes(item.status)) continue;
    const topic = (item.topic ?? "").trim();
    if (topic === "") continue;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return counts;
}
