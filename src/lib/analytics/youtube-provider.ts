import { YOUTUBE_ANALYTICS_BASE } from "@/lib/youtube/config";

import type { MetricName } from "./types";
import {
  registerAnalyticsProvider,
  type AnalyticsErrorCategory,
  type AnalyticsFetchRequest,
  type AnalyticsFetchResult,
  type AnalyticsProvider,
  type FetchedPostMetrics,
} from "./providers";

/**
 * The YouTube analytics adapter.
 *
 * Reads the **YouTube Analytics API**, which is a different service from the
 * Data API that Stage 7 uses to upload — its host and scope both live in
 * `@/lib/youtube/config`, where every platform hostname in this codebase is
 * confined.
 * It needs its own scope, `yt-analytics.readonly`, which the publishing
 * connection does not carry — so a connected channel is not automatically a
 * measurable one, and this adapter reports `permission_missing` rather than
 * zeroes when the scope is absent.
 *
 * ## The shape of a query
 *
 * One request returns a table: `columnHeaders` naming the metrics and `rows`
 * of values, filtered to specific videos. Asking per-video would be one
 * request per post and a quota bill to match, so the whole batch goes in one
 * call with `dimensions=video`.
 *
 * ## What is never done here
 *
 * A metric absent from the response is **absent from the result**, never
 * defaulted to zero. YouTube omits a column it cannot compute, and filling
 * that with `0` would turn "we could not measure this" into "nobody watched".
 */

/**
 * The metrics requested, and their canonical names.
 *
 * `estimatedMinutesWatched` is minutes; everything downstream works in
 * seconds, so it is converted at the boundary and the conversion is recorded
 * in the raw name so the figure stays traceable.
 */
const METRIC_MAP: Record<string, MetricName> = {
  views: "views_or_plays",
  estimatedMinutesWatched: "watch_time_seconds",
  averageViewDuration: "average_view_duration_seconds",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  subscribersGained: "followers_gained",
};

const REQUESTED_METRICS = Object.keys(METRIC_MAP);

/** Metrics YouTube reports in minutes that this system stores in seconds. */
const MINUTES_TO_SECONDS = new Set(["estimatedMinutesWatched"]);

export function categoriseYouTubeAnalyticsError(
  status: number,
  body: unknown,
): AnalyticsErrorCategory {
  const message =
    typeof body === "object" && body !== null
      ? String(
          (body as { error?: { message?: string } }).error?.message ?? "",
        ).toLowerCase()
      : "";

  if (status === 401) {
    return "token_expired";
  }
  if (status === 403) {
    // Google uses 403 for both "you did not ask for this scope" and "quota
    // exhausted", and they need opposite responses: one is a reconnection, the
    // other is a retry later.
    if (message.includes("quota") || message.includes("rate")) {
      return "rate_limited";
    }
    return "permission_missing";
  }
  if (status === 400) {
    if (message.includes("filter") || message.includes("video")) {
      return "invalid_external_id";
    }
    return "unsupported_metric";
  }
  if (status === 404) {
    return "post_unavailable";
  }
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "provider_unavailable";
  }
  return "unknown";
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Read one report table into per-post metrics.
 *
 * Exported so the mapping can be tested against a real documented response
 * shape without a network, an account or a token.
 */
export function mapReportRows(
  body: unknown,
  request: {
    window: AnalyticsFetchRequest["window"];
    observedAt: Date;
    periodStart: Date | null;
    periodEnd: Date | null;
  },
): FetchedPostMetrics[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }

  const table = body as {
    columnHeaders?: { name?: string }[];
    rows?: unknown[][];
  };

  const headers = (table.columnHeaders ?? []).map((header) =>
    typeof header?.name === "string" ? header.name : "",
  );

  const videoIndex = headers.indexOf("video");
  if (videoIndex === -1) {
    return [];
  }

  const results: FetchedPostMetrics[] = [];

  for (const row of table.rows ?? []) {
    if (!Array.isArray(row)) {
      continue;
    }

    const externalPostId = row[videoIndex];
    if (typeof externalPostId !== "string" || externalPostId === "") {
      continue;
    }

    const values: FetchedPostMetrics["values"] = {};

    headers.forEach((header, index) => {
      const canonical = METRIC_MAP[header];
      if (canonical === undefined) {
        return;
      }

      const raw = row[index];
      // A non-numeric cell is a cell YouTube could not fill. It is skipped
      // rather than coerced — `Number(null)` is 0, and that is the bug this
      // whole stage exists to prevent.
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return;
      }

      const value = MINUTES_TO_SECONDS.has(header) ? raw * 60 : raw;

      values[canonical] = {
        value,
        // The platform's own name, with the conversion recorded so the stored
        // figure can be checked against what YouTube actually said.
        rawName: MINUTES_TO_SECONDS.has(header)
          ? `${header} (minutes, stored as seconds)`
          : header,
      };
    });

    results.push({
      externalPostId,
      window: request.window,
      observedAt: request.observedAt,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      values,
    });
  }

  return results;
}

export class YouTubeAnalyticsProvider implements AnalyticsProvider {
  readonly platform = "youtube" as const;
  readonly source = "youtube_api" as const;
  readonly metrics: readonly MetricName[] = Object.values(METRIC_MAP);

  async fetch(request: AnalyticsFetchRequest): Promise<AnalyticsFetchResult> {
    if (request.externalPostIds.length === 0) {
      return { ok: true, metrics: [] };
    }

    // A lifetime reading still needs a range: the API has no "all time" mode,
    // so it is asked from before YouTube existed to today, which is the
    // documented way to express cumulative-to-date.
    const start = request.periodStart ?? new Date("2005-01-01T00:00:00Z");
    const end = request.periodEnd ?? new Date();

    const url = new URL(YOUTUBE_ANALYTICS_BASE);
    url.searchParams.set("ids", "channel==MINE");
    url.searchParams.set("startDate", isoDate(start));
    url.searchParams.set("endDate", isoDate(end));
    url.searchParams.set("metrics", REQUESTED_METRICS.join(","));
    url.searchParams.set("dimensions", "video");
    url.searchParams.set(
      "filters",
      `video==${request.externalPostIds.join(",")}`,
    );
    url.searchParams.set("maxResults", String(request.externalPostIds.length));

    let response: Response;
    try {
      response = await (request.fetchImpl ?? fetch)(url.toString(), {
        method: "GET",
        // The token goes in a header and nowhere else. A token in a query
        // string is a token in every proxy log between here and Google.
        headers: { Authorization: `Bearer ${request.accessToken}` },
      });
    } catch {
      return {
        ok: false,
        category: "transient",
        detail: "The request to YouTube Analytics could not be completed.",
      };
    }

    const text = await response.text();
    let body: unknown = null;
    if (text.trim() !== "") {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const category = categoriseYouTubeAnalyticsError(response.status, body);
      return {
        ok: false,
        category,
        // Google's message can quote the request. Only a mapped sentence goes
        // forward.
        detail: describeCategory(category),
      };
    }

    return {
      ok: true,
      metrics: mapReportRows(body, {
        window: request.window,
        observedAt: end,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
      }),
    };
  }
}

function describeCategory(category: AnalyticsErrorCategory): string {
  switch (category) {
    case "permission_missing":
      return "The YouTube connection does not carry the analytics permission. Reconnect and grant it to start reading figures.";
    case "token_expired":
      return "Google rejected the stored authorisation. Reconnect the channel.";
    case "rate_limited":
      return "Google rate limited the analytics request. It will be tried again.";
    case "invalid_external_id":
      return "YouTube did not recognise one of the video ids in this batch.";
    case "post_unavailable":
      return "YouTube could not find that video. Its recorded history is kept.";
    case "provider_unavailable":
      return "YouTube Analytics is unavailable.";
    case "unsupported_metric":
      return "YouTube refused the requested combination of metrics.";
    default:
      return "YouTube Analytics refused the request.";
  }
}

export const youtubeAnalyticsProvider = new YouTubeAnalyticsProvider();

registerAnalyticsProvider("youtube", () => youtubeAnalyticsProvider);
