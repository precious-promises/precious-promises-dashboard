import {
  INSTAGRAM_API_VERSION,
  INSTAGRAM_GRAPH_BASE,
} from "@/lib/instagram/config";

import {
  registerAnalyticsProvider,
  type AnalyticsErrorCategory,
  type AnalyticsFetchRequest,
  type AnalyticsFetchResult,
  type AnalyticsProvider,
  type FetchedPostMetrics,
} from "./providers";
import type { MetricName } from "./types";

/**
 * The Instagram analytics adapter.
 *
 * Reads media insights through the same Instagram Login connection Stage 8
 * established — no additional scope is needed, which makes Instagram the one
 * platform here where a publishing connection is also a measuring one.
 *
 * ## `views`, not `impressions`
 *
 * Meta deprecated `impressions` and replaced it with `views`. A request for
 * `impressions` against media created after 2 July 2024 returns an **error**,
 * not a zero. This adapter asks for `views` and stores `views` as the raw
 * name, so the provenance matches what Meta actually answered rather than what
 * an older integration used to ask.
 *
 * ## No watch time
 *
 * Meta exposes no watch-time or average-watch-time metric for Reels through
 * this API. Rather than showing an empty column that looks like a failure, or
 * a zero that looks like nobody watched, Instagram simply does not report that
 * metric — see `PLATFORM_ANALYTICS_CAPABILITIES`, which the interface reads to
 * decide what to even ask for.
 *
 * ## Per-media requests
 *
 * Meta's insights endpoint is per-media: there is no batch form. Each post is
 * one request, and a failure on one does **not** discard the others — a single
 * deleted Reel must not cost the whole sync.
 */

/** Meta's metric names, mapped to this system's canonical vocabulary. */
const METRIC_MAP: Record<string, MetricName> = {
  views: "views_or_plays",
  reach: "reach",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saved: "saves",
};

const REQUESTED_METRICS = Object.keys(METRIC_MAP);

export function categoriseInstagramAnalyticsError(
  status: number,
  body: unknown,
): AnalyticsErrorCategory {
  const error =
    typeof body === "object" && body !== null
      ? (body as { error?: { code?: number; message?: string } }).error
      : undefined;

  const message = String(error?.message ?? "").toLowerCase();
  const code = error?.code;

  // Meta's own codes are more reliable than the status, which is 400 for a
  // great many unrelated conditions.
  if (code === 190) {
    return "token_expired";
  }
  if (code === 10 || code === 200 || code === 803) {
    return "permission_missing";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return "rate_limited";
  }

  if (
    message.includes("does not exist") ||
    message.includes("cannot be loaded")
  ) {
    return "post_unavailable";
  }
  if (message.includes("not supported") || message.includes("metric")) {
    return "unsupported_metric";
  }

  if (status === 401) {
    return "token_expired";
  }
  if (status === 403) {
    return "permission_missing";
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

/**
 * Read one media-insights response.
 *
 * Meta answers with `data: [{ name, values: [{ value }] }]`. A metric it could
 * not compute is **omitted from the array** — so an absent entry stays absent
 * here rather than becoming zero.
 */
export function mapMediaInsights(
  body: unknown,
  input: {
    externalPostId: string;
    window: AnalyticsFetchRequest["window"];
    observedAt: Date;
    periodStart: Date | null;
    periodEnd: Date | null;
  },
): FetchedPostMetrics {
  const values: FetchedPostMetrics["values"] = {};

  const entries =
    typeof body === "object" && body !== null
      ? ((body as { data?: unknown[] }).data ?? [])
      : [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const record = entry as { name?: string; values?: { value?: unknown }[] };
    const rawName = record.name;
    if (typeof rawName !== "string") {
      continue;
    }

    const canonical = METRIC_MAP[rawName];
    if (canonical === undefined) {
      continue;
    }

    const first = record.values?.[0]?.value;
    if (typeof first !== "number" || !Number.isFinite(first)) {
      continue;
    }

    values[canonical] = { value: first, rawName };
  }

  return {
    externalPostId: input.externalPostId,
    window: input.window,
    observedAt: input.observedAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    values,
  };
}

export class InstagramAnalyticsProvider implements AnalyticsProvider {
  readonly platform = "instagram" as const;
  readonly source = "instagram_api" as const;
  readonly metrics: readonly MetricName[] = Object.values(METRIC_MAP);

  async fetch(request: AnalyticsFetchRequest): Promise<AnalyticsFetchResult> {
    if (request.externalPostIds.length === 0) {
      return { ok: true, metrics: [] };
    }

    const collected: FetchedPostMetrics[] = [];
    const failures: AnalyticsErrorCategory[] = [];
    const observedAt = request.periodEnd ?? new Date();

    for (const externalPostId of request.externalPostIds) {
      const url = new URL(
        `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${encodeURIComponent(externalPostId)}/insights`,
      );
      url.searchParams.set("metric", REQUESTED_METRICS.join(","));

      let response: Response;
      try {
        response = await (request.fetchImpl ?? fetch)(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${request.accessToken}` },
        });
      } catch {
        failures.push("transient");
        continue;
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
        failures.push(categoriseInstagramAnalyticsError(response.status, body));
        // One unreachable Reel does not end the sync. The rest are still worth
        // having, and the failure is reported alongside them.
        continue;
      }

      collected.push(
        mapMediaInsights(body, {
          externalPostId,
          window: request.window,
          observedAt,
          periodStart: request.periodStart,
          periodEnd: request.periodEnd,
        }),
      );
    }

    // Every single post failed, and for the same reason — that is a connection
    // problem rather than a content problem, and is reported as one.
    if (collected.length === 0 && failures.length > 0) {
      const category = failures[0];
      return {
        ok: false,
        category,
        detail: describeCategory(category),
      };
    }

    return { ok: true, metrics: collected };
  }
}

function describeCategory(category: AnalyticsErrorCategory): string {
  switch (category) {
    case "permission_missing":
      return "Meta refused the insights request for this account. The connection may lack the permission, or the account may not be a professional one.";
    case "token_expired":
      return "Meta rejected the stored authorisation. Reconnect the Instagram account.";
    case "rate_limited":
      return "Meta rate limited the insights request. It will be tried again.";
    case "post_unavailable":
      return "Meta could not find that media. Its recorded history is kept.";
    case "unsupported_metric":
      return "Meta does not report one of the requested metrics for this media type.";
    case "provider_unavailable":
      return "Instagram Insights is unavailable.";
    default:
      return "Instagram Insights refused the request.";
  }
}

export const instagramAnalyticsProvider = new InstagramAnalyticsProvider();

registerAnalyticsProvider("instagram", () => instagramAnalyticsProvider);
