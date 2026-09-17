import { OWNER_NAME } from "@/config/owner";
import { loadSocialAccounts } from "@/lib/accounts/repository";
import { loadAnalyticsOverview } from "@/lib/analytics/overview";
import { isAiConfigured } from "@/lib/ai/server-config";
import { loadReviewRows } from "@/lib/approvals/repository";
import { EMPTY_FILTERS } from "@/lib/content/filters";
import {
  countScriptureNeedingAttention,
  getContentCounts,
  listContentItems,
} from "@/lib/content/repository";
import { greetingFor } from "@/lib/greeting";
import { loadBoard } from "@/lib/production/board";
import type { ProductionStage } from "@/lib/production/stage";
import { isRenderConfigured } from "@/lib/render/server-config";
import { listScheduleEntries } from "@/lib/schedule/repository";
import { partsInTimeZone } from "@/lib/schedule/timezone";
import { effectiveSettings, loadAppSettings } from "@/lib/settings/repository";
import { countItemsWithScripts } from "@/lib/scripts/repository";
import { isWorkerConfigured } from "@/lib/supabase/worker";
import { countVideoProjects } from "@/lib/video/repository";
import { isElevenLabsConfigured } from "@/lib/voice/server-config";
import { analyticsSchedulingConnected } from "@/trigger/analytics";

function sameScheduleDay(date: Date, timezone: string, comparison: Date) {
  const key = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  return key(date) === key(comparison);
}

export async function loadDashboardData() {
  const [
    counts,
    scriptureNeedingAttention,
    itemsWithScripts,
    videoProjectsCount,
    reviewRows,
    scheduleEntries,
    board,
    socialAccounts,
    recentItems,
  ] = await Promise.all([
    getContentCounts(),
    countScriptureNeedingAttention(),
    countItemsWithScripts(),
    countVideoProjects(),
    loadReviewRows(),
    listScheduleEntries(),
    loadBoard(),
    loadSocialAccounts(),
    listContentItems(EMPTY_FILTERS),
  ]);

  const analytics = await loadAnalyticsOverview();
  const timezone = effectiveSettings(await loadAppSettings()).timezone;
  const now = new Date();
  const todayEntries = scheduleEntries.filter(
    (entry) =>
      entry.post.status === "scheduled" &&
      sameScheduleDay(new Date(entry.post.scheduled_for), timezone, now),
  );
  const awaitingApproval = reviewRows.filter(
    (row) => row.variant.review_state === "ready_for_review",
  ).length;
  const approvalQueue = reviewRows
    .filter((row) => row.variant.review_state === "ready_for_review")
    .slice(0, 5);
  const latestContent = recentItems[0] ?? null;

  const stageCounts: Partial<Record<ProductionStage, number>> = {};
  for (const card of board) {
    stageCounts[card.stage] = (stageCounts[card.stage] ?? 0) + 1;
  }

  const approved = reviewRows.filter((row) => row.validity === "valid").length;
  const scheduled = scheduleEntries.filter(
    (entry) => entry.post.status === "scheduled",
  ).length;
  const postedThisWeek = scheduleEntries.filter(
    (entry) =>
      entry.post.status === "posted" &&
      entry.post.posted_at !== null &&
      new Date(entry.post.posted_at).getTime() <= now.getTime() &&
      now.getTime() - new Date(entry.post.posted_at).getTime() <
        7 * 24 * 60 * 60 * 1000,
  ).length;
  const publishFailures = scheduleEntries.filter(
    (entry) => entry.post.status === "failed",
  ).length;

  const readiness = [
    {
      label: "Render worker",
      ready: isRenderConfigured() && isWorkerConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "ElevenLabs",
      ready: isElevenLabsConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "AI drafting",
      ready: isAiConfigured(),
      readyLabel: "Configured",
      offLabel: "Not configured",
    },
    {
      label: "Scheduled jobs",
      ready: analyticsSchedulingConnected(),
      readyLabel: "Connected",
      offLabel: "Not connected",
    },
  ];

  const greeting = greetingFor(partsInTimeZone(now, timezone).hour, OWNER_NAME);

  return {
    counts,
    scriptureNeedingAttention,
    itemsWithScripts,
    videoProjectsCount,
    scheduleEntries,
    board,
    socialAccounts,
    recentItems,
    analytics,
    now,
    todayEntries,
    awaitingApproval,
    approvalQueue,
    latestContent,
    stageCounts,
    approved,
    scheduled,
    postedThisWeek,
    publishFailures,
    readiness,
    greeting,
    timezone,
  };
}
