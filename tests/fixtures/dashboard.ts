// Test-only fixture. This module is never imported by application routes.
import type { loadDashboardData } from "@/lib/dashboard/overview";
import { METRIC_NAMES, unavailable } from "@/lib/analytics/types";
import type { ContentItem } from "@/lib/content/types";
const item: ContentItem = {
  id: "fixture",
  owner_id: "fixture",
  title: "Test",
  topic: "Test",
  content_type: "youtube_short",
  scripture_reference: null,
  scripture_text: null,
  scripture_translation: "KJV",
  scripture_verification_status: "unverified",
  scripture_verified_at: null,
  scripture_verified_by: null,
  description: null,
  status: "draft",
  created_at: "2026-09-15T12:00:00Z",
  updated_at: "2026-09-15T12:00:00Z",
};
export function dashboardFixture() {
  const data: Awaited<ReturnType<typeof loadDashboardData>> = {
    counts: { total: 1, draft: 1, readyForReview: 0, archived: 0 },
    scriptureNeedingAttention: 0,
    itemsWithScripts: 0,
    videoProjectsCount: 0,
    scheduleEntries: [],
    board: [
      {
        item,
        stage: "plan",
        variants: [],
        hasScript: false,
        latestScriptRevision: null,
        hasVideo: false,
        videoStatus: null,
        validApprovals: 0,
        staleApprovals: 0,
        schedules: [],
      },
    ],
    socialAccounts: [],
    recentItems: [item],
    analytics: {
      readiness: [],
      publishedCount: 0,
      measuredCount: 0,
      posts: [],
      totals: Object.fromEntries(
        METRIC_NAMES.map((m) => [m, unavailable(m, "not_yet_fetched")]),
      ) as Awaited<ReturnType<typeof loadDashboardData>>["analytics"]["totals"],
      lastFetchedAt: null,
      hasAnyData: false,
    },
    now: new Date("2026-09-15T12:00:00Z"),
    todayEntries: [],
    awaitingApproval: 0,
    approvalQueue: [],
    latestContent: item,
    stageCounts: { plan: 1 },
    approved: 0,
    scheduled: 0,
    postedThisWeek: 0,
    publishFailures: 0,
    readiness: [
      {
        label: "Render worker",
        ready: false,
        readyLabel: "Configured",
        offLabel: "Not configured",
      },
      {
        label: "ElevenLabs",
        ready: false,
        readyLabel: "Configured",
        offLabel: "Not configured",
      },
      {
        label: "AI drafting",
        ready: false,
        readyLabel: "Configured",
        offLabel: "Not configured",
      },
      {
        label: "Scheduled jobs",
        ready: false,
        readyLabel: "Connected",
        offLabel: "Not connected",
      },
    ],
    greeting: "Good afternoon, Dave",
    timezone: "Europe/London",
  };

  return data;
}
