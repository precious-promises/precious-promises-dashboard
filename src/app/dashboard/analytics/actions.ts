"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MANUAL_RAW_NAME,
  MANUAL_SOURCE,
  manualEntryValuesFrom,
  parseManualEntry,
  type ManualEntryFieldErrors,
} from "@/lib/analytics/manual";
import { syncPlatformAnalytics } from "@/lib/analytics/sync";
import { METRIC_UNIT_BY_NAME } from "@/lib/analytics/types";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VariantPlatform } from "@/lib/variants/types";

/**
 * Analytics write paths.
 *
 * Two of them, and they are deliberately different animals.
 *
 * **Manual entry** goes through the owner's own session, so RLS applies — and
 * the insert policy on `analytics_snapshots` permits `source = 'manual'` and
 * nothing else. That is what makes forging an `instagram_api` row impossible
 * from a browser, regardless of what this file does.
 *
 * **Refresh** calls the orchestration layer directly rather than through
 * Trigger.dev, so Dave can fetch figures today without any scheduling being
 * deployed. It is the same code the scheduled task would run.
 */

const ANALYTICS_PATH = "/dashboard/analytics";

export interface ManualEntryState {
  error?: string;
  notice?: string;
  fieldErrors?: ManualEntryFieldErrors;
}

/**
 * Record a figure Dave read off a platform himself.
 *
 * `source` is fixed here and never taken from the form. Even if it were, the
 * database would refuse anything else — but a value a caller could set is a
 * value someone will eventually set wrongly.
 */
export async function recordManualAnalytics(
  _previous: ManualEntryState,
  formData: FormData,
): Promise<ManualEntryState> {
  const parsed = parseManualEntry(manualEntryValuesFrom(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const values = parsed.data;

  // If a scheduled post was named, prove the owner owns it before binding a
  // figure to it. The worker credential is not in play here, but a forged id
  // would still attach a number to somebody else's record.
  let scheduledPostId: string | null = null;
  let platformVariantId: string | null = null;
  let contentItemId: string | null = null;

  if (values.scheduled_post_id) {
    const { data: post } = await supabase
      .from("scheduled_posts")
      .select("id, platform_variant_id")
      .eq("id", values.scheduled_post_id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (post) {
      const row = post as { id: string; platform_variant_id: string };
      scheduledPostId = row.id;
      platformVariantId = row.platform_variant_id;

      const { data: variant } = await supabase
        .from("platform_variants")
        .select("content_item_id")
        .eq("id", row.platform_variant_id)
        .eq("owner_id", user.id)
        .maybeSingle();

      contentItemId =
        (variant as { content_item_id: string } | null)?.content_item_id ??
        null;
    }
  }

  const observedAt = new Date(`${values.observed_on}T12:00:00Z`);
  if (Number.isNaN(observedAt.getTime())) {
    return { fieldErrors: { observed_on: "That date could not be read." } };
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("analytics_snapshots")
    .upsert(
      {
        owner_id: user.id,
        platform: values.platform,
        // Fixed. Not from the form, and refused by the database if it were.
        source: MANUAL_SOURCE,
        external_post_id: values.external_post_id,
        scheduled_post_id: scheduledPostId,
        platform_variant_id: platformVariantId,
        content_item_id: contentItemId,
        observation_window: values.observation_window,
        observed_at: observedAt.toISOString(),
        fetched_at: new Date().toISOString(),
      },
      {
        onConflict:
          "owner_id,platform,external_post_id,source,observation_window",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (snapshotError || !snapshot) {
    return {
      error: "That figure could not be saved. Check the post id and try again.",
    };
  }

  const snapshotId = (snapshot as { id: string }).id;

  const { error: metricError } = await supabase
    .from("analytics_metrics")
    .upsert(
      {
        owner_id: user.id,
        snapshot_id: snapshotId,
        metric_name: values.metric_name,
        raw_metric_name: MANUAL_RAW_NAME,
        metric_value: values.metric_value,
        metric_unit: METRIC_UNIT_BY_NAME[values.metric_name],
      },
      { onConflict: "snapshot_id,metric_name" },
    );

  if (metricError) {
    return { error: "That figure could not be saved." };
  }

  // The platform and metric, never the value. The audit log is a record that
  // something happened, not a second and diverging copy of the data.
  await recordAudit(
    "analytics_manual_entry_recorded",
    "scheduled_post",
    scheduledPostId ?? snapshotId,
    { platform: values.platform, metric: values.metric_name },
  );

  revalidatePath(ANALYTICS_PATH);
  revalidatePath("/dashboard/growth");
  revalidatePath("/dashboard");

  return {
    notice:
      "Saved, and labelled as entered by hand. It will never be shown as an API figure.",
  };
}

export interface RefreshState {
  error?: string;
  notice?: string;
}

/**
 * Fetch analytics now, for one platform.
 *
 * Deliberately independent of Trigger.dev: no project is connected, and this
 * has to work anyway. It runs the same orchestration the scheduled task would.
 */
export async function refreshAnalytics(
  _previous: RefreshState,
  formData: FormData,
): Promise<RefreshState> {
  const platform = formData.get("platform");

  if (
    platform !== "youtube" &&
    platform !== "instagram" &&
    platform !== "tiktok"
  ) {
    return { error: "That platform could not be recognised." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const result = await syncPlatformAnalytics({
    ownerId: user.id,
    platform: platform as VariantPlatform,
    triggerSource: "manual",
  });

  revalidatePath(ANALYTICS_PATH);
  revalidatePath("/dashboard/growth");
  revalidatePath("/dashboard");

  if (!result.ok) {
    // The failure is reported and the existing figures are left exactly where
    // they were. A failed refresh never blanks good data.
    return {
      error:
        result.detail ??
        "The refresh did not succeed. Any figures shown are the last read successfully.",
    };
  }

  if (result.snapshotsWritten === 0) {
    return {
      notice:
        result.postsConsidered === 0
          ? "Nothing has been published to this platform yet, so there was nothing to measure."
          : "The platform was asked and returned nothing new.",
    };
  }

  return {
    notice: `Fetched figures for ${result.snapshotsWritten} of ${result.postsConsidered} published ${result.postsConsidered === 1 ? "post" : "posts"}.`,
  };
}
