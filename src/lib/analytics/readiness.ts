import type { SocialAccount } from "@/lib/accounts/types";
import type { VariantPlatform } from "@/lib/variants/types";

import { analyticsCapabilityFor } from "./providers";
import type { AnalyticsSyncRun, UnavailableReason } from "./types";

/**
 * Whether a platform's analytics can be read, and why not when they cannot.
 *
 * **Analytics readiness is not publishing readiness.** A connected YouTube
 * channel can upload and still be unmeasurable, because the analytics scope is
 * a separate grant Stage 7 never asked for. Conflating the two would tell Dave
 * his channel is fine while every figure on the page stays blank with no
 * explanation.
 *
 * So this answers five separate questions, and the interface shows all five:
 *
 * 1. Is an account connected?
 * 2. Can it publish?
 * 3. Can its analytics be read?
 * 4. Does an adapter exist at all?
 * 5. When did it last sync, and did that work?
 */

export interface AnalyticsReadiness {
  platform: VariantPlatform;

  /** An adapter exists in this repository. Says nothing about connection. */
  providerImplemented: boolean;

  /** An account row exists and is not disconnected. */
  accountConnected: boolean;

  /** That account can publish — the Stage 7/8/9 question. */
  publishingAuthorised: boolean;

  /** That account can be measured — a different grant. */
  analyticsAuthorised: boolean;

  /** Scopes that would have to be granted, if any are missing. */
  missingScopes: readonly string[];

  lastSync: AnalyticsSyncRun | null;
  lastSuccessfulSync: AnalyticsSyncRun | null;

  /** Set when analytics cannot currently be read. */
  blockedBy: UnavailableReason | null;

  /** What the owner would do about it, in one sentence. */
  action: string | null;
}

/**
 * Whether an account's granted scopes cover analytics.
 *
 * Exported because it is the load-bearing check: it is what stops a connected
 * channel being mistaken for a measurable one.
 */
export function hasAnalyticsScopes(
  platform: VariantPlatform,
  grantedScopes: readonly string[],
): boolean {
  const required = analyticsCapabilityFor(platform).additionalScopes;
  return required.every((scope) => grantedScopes.includes(scope));
}

export function missingAnalyticsScopes(
  platform: VariantPlatform,
  grantedScopes: readonly string[],
): string[] {
  return analyticsCapabilityFor(platform).additionalScopes.filter(
    (scope) => !grantedScopes.includes(scope),
  );
}

export function assessAnalyticsReadiness(input: {
  platform: VariantPlatform;
  account: SocialAccount | null;
  publishingAuthorised: boolean;
  runs: readonly AnalyticsSyncRun[];
}): AnalyticsReadiness {
  const { platform, account, publishingAuthorised, runs } = input;
  const capability = analyticsCapabilityFor(platform);

  const platformRuns = runs.filter((run) => run.platform === platform);
  const lastSync = platformRuns[0] ?? null;
  const lastSuccessfulSync =
    platformRuns.find(
      (run) => run.status === "succeeded" || run.status === "partial",
    ) ?? null;

  const base = {
    platform,
    providerImplemented: capability.implemented,
    lastSync,
    lastSuccessfulSync,
  };

  // No adapter. Checked first, because a connection would not help.
  if (!capability.implemented) {
    return {
      ...base,
      accountConnected: account !== null && account.status !== "disconnected",
      publishingAuthorised,
      analyticsAuthorised: false,
      missingScopes: [],
      blockedBy: capability.unavailableReason ?? "provider_not_supported",
      action: null,
    };
  }

  if (account === null || account.status === "disconnected") {
    return {
      ...base,
      accountConnected: false,
      publishingAuthorised: false,
      analyticsAuthorised: false,
      missingScopes: capability.additionalScopes,
      blockedBy: "platform_not_connected",
      action: "Connect the account on Connected Accounts.",
    };
  }

  if (account.status === "needs_reconnect") {
    return {
      ...base,
      accountConnected: true,
      publishingAuthorised: false,
      analyticsAuthorised: false,
      missingScopes: capability.additionalScopes,
      blockedBy: "platform_not_connected",
      action:
        "Reconnect the account — the platform rejected its authorisation.",
    };
  }

  const missing = missingAnalyticsScopes(platform, account.granted_scopes);

  if (missing.length > 0) {
    return {
      ...base,
      accountConnected: true,
      publishingAuthorised,
      analyticsAuthorised: false,
      missingScopes: missing,
      blockedBy: "analytics_permission_missing",
      action:
        "Reconnect and grant the analytics permission. Publishing keeps working meanwhile.",
    };
  }

  // Everything granted. If nothing has ever synced, that is still not zero —
  // it is unmeasured, and the interface says so.
  if (lastSuccessfulSync === null) {
    return {
      ...base,
      accountConnected: true,
      publishingAuthorised,
      analyticsAuthorised: true,
      missingScopes: [],
      blockedBy: "not_yet_fetched",
      action: "Refresh analytics to fetch figures for the first time.",
    };
  }

  // A failed latest run does not blank the data. The last good figures stay,
  // labelled with when they were read.
  if (lastSync !== null && lastSync.status === "failed") {
    return {
      ...base,
      accountConnected: true,
      publishingAuthorised,
      analyticsAuthorised: true,
      missingScopes: [],
      blockedBy: "fetch_failed",
      action:
        "The latest refresh failed. Figures shown are the last read successfully.",
    };
  }

  return {
    ...base,
    accountConnected: true,
    publishingAuthorised,
    analyticsAuthorised: true,
    missingScopes: [],
    blockedBy: null,
    action: null,
  };
}

/** Whether any platform can currently produce a figure. */
export function anyPlatformMeasurable(
  readiness: readonly AnalyticsReadiness[],
): boolean {
  return readiness.some(
    (entry) => entry.analyticsAuthorised && entry.lastSuccessfulSync !== null,
  );
}
