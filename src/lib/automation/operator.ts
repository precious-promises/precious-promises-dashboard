import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentItem } from "@/lib/content/types";
import { runAiGeneration } from "@/lib/ai/generations";
import { recordAuditAsWorker } from "@/lib/audit/repository";
import type { PlannerItem } from "@/lib/planner/types";
import type { ScriptRevision } from "@/lib/scripts/types";
import type { VariantPlatform, VariantType } from "@/lib/variants/types";

const MAX_ITEMS_PER_PASS = 4;

export interface OperatorSummary {
  itemsInspected: number;
  scriptsPrepared: number;
  variantsPrepared: number;
  videosPrepared: number;
  submittedForReview: number;
  blockedUnverifiedScripture: number;
  skippedAlreadyComplete: number;
  aiFailures: number;
}

export interface OperatorRunResult {
  status: "completed" | "disabled" | "failed";
  summary: OperatorSummary;
  error: string | null;
}

interface OperatorSettings {
  automation_enabled: boolean;
  automation_create_working_drafts: boolean;
  automation_prepare_video_drafts: boolean;
  automation_submit_for_review: boolean;
}

function emptySummary(): OperatorSummary {
  return {
    itemsInspected: 0,
    scriptsPrepared: 0,
    variantsPrepared: 0,
    videosPrepared: 0,
    submittedForReview: 0,
    blockedUnverifiedScripture: 0,
    skippedAlreadyComplete: 0,
    aiFailures: 0,
  };
}

function sourcePlatform(item: ContentItem): VariantPlatform {
  if (item.content_type.startsWith("instagram_")) return "instagram";
  if (item.content_type.startsWith("tiktok_")) return "tiktok";
  return "youtube";
}

function variantTypeFor(
  platform: VariantPlatform,
  item: ContentItem,
): VariantType {
  if (platform === "youtube") {
    return item.content_type === "youtube_short" ||
      item.content_type === "instagram_reel" ||
      item.content_type === "tiktok_video"
      ? "youtube_short"
      : "youtube_video";
  }
  if (platform === "instagram") {
    if (item.content_type === "instagram_image") return "instagram_image";
    if (item.content_type === "instagram_carousel") return "instagram_carousel";
    return "instagram_reel";
  }
  return "tiktok_video";
}

function requiresVideo(item: ContentItem): boolean {
  return (
    item.content_type !== "instagram_image" &&
    item.content_type !== "instagram_carousel"
  );
}

function targetPlatforms(
  item: ContentItem,
  plannerItems: readonly PlannerItem[],
): VariantPlatform[] {
  const linked = plannerItems.find(
    (candidate) =>
      candidate.content_item_id === item.id &&
      candidate.status !== "done" &&
      candidate.status !== "dropped",
  );
  if (linked && linked.target_platforms.length > 0) {
    return [...new Set(linked.target_platforms)];
  }
  return [sourcePlatform(item)];
}

async function prepareScript(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
): Promise<ScriptRevision | null> {
  const { data: existing } = await client
    .from("script_revisions")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as ScriptRevision;

  const outcome = await runAiGeneration(client, {
    ownerId,
    contentItemId: item.id,
    platformVariantId: null,
    request: {
      type: "script_draft",
      instruction:
        "Prepare a concise Precious Promises working script from the verified Scripture and topic. Keep Scripture separate from authored prose. Include a clear hook, explanation, optional declaration or prayer, and a short outro.",
      scripture:
        item.scripture_reference && item.scripture_text
          ? {
              reference: item.scripture_reference,
              text: item.scripture_text,
              translation: item.scripture_translation,
            }
          : null,
      workingMaterial: item.topic
        ? `TOPIC: ${item.topic}\nDESCRIPTION: ${item.description ?? ""}`
        : item.description,
      platform: sourcePlatform(item),
    },
  });

  if (!outcome.ok || !outcome.generationId || !outcome.result?.ok) {
    return null;
  }

  const output = outcome.result.output as Partial<
    Pick<
      ScriptRevision,
      "hook" | "explanation" | "declaration" | "prayer" | "outro"
    >
  >;

  const { data: inserted, error } = await client
    .from("script_revisions")
    .insert({
      owner_id: ownerId,
      content_item_id: item.id,
      revision_number: 1,
      hook: output.hook ?? null,
      explanation: output.explanation ?? null,
      declaration: output.declaration ?? null,
      prayer: output.prayer ?? null,
      outro: output.outro ?? null,
      notes:
        "Prepared by Operator Mode as a working draft. Human approval is still required before scheduling or publishing.",
    })
    .select("*")
    .single();

  if (error || !inserted) return null;

  await client
    .from("ai_generations")
    .update({
      status: "prepared",
      accepted_target_kind: "script_revision",
      accepted_target_id: (inserted as { id: string }).id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", outcome.generationId)
    .eq("owner_id", ownerId)
    .eq("status", "drafted");

  await recordAuditAsWorker(
    client,
    ownerId,
    "ai_generation_prepared",
    "ai_generation",
    outcome.generationId,
    { target: "script_revision" },
  );

  return inserted as ScriptRevision;
}

async function prepareVariant(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  platform: VariantPlatform,
  submitForReview: boolean,
): Promise<{ prepared: boolean; submitted: boolean; aiFailed: boolean }> {
  const { data: existing } = await client
    .from("platform_variants")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id)
    .eq("platform", platform)
    .limit(1)
    .maybeSingle();

  if (
    existing &&
    ["ready_for_review", "approved"].includes(
      (existing as { review_state: string }).review_state,
    )
  ) {
    return { prepared: false, submitted: false, aiFailed: false };
  }

  const outcome = await runAiGeneration(client, {
    ownerId,
    contentItemId: item.id,
    platformVariantId: existing ? (existing as { id: string }).id : null,
    request: {
      type: "caption",
      instruction:
        platform === "youtube"
          ? "Prepare polished YouTube description or caption copy for this content item. Keep it concise, faithful to the source, and do not alter Scripture."
          : `Prepare polished ${platform} caption copy for this content item. Keep it concise, natural and faithful to the verified source.`,
      scripture:
        item.scripture_reference && item.scripture_text
          ? {
              reference: item.scripture_reference,
              text: item.scripture_text,
              translation: item.scripture_translation,
            }
          : null,
      workingMaterial: [item.title, item.topic, item.description]
        .filter(Boolean)
        .join("\n"),
      platform,
    },
  });

  if (!outcome.ok || !outcome.generationId || !outcome.result?.ok) {
    return { prepared: false, submitted: false, aiFailed: true };
  }

  const caption =
    typeof outcome.result.output.caption === "string"
      ? outcome.result.output.caption
      : "";
  if (!caption.trim()) {
    return { prepared: false, submitted: false, aiFailed: true };
  }

  const reviewState = submitForReview ? "ready_for_review" : "draft";
  const variantType = variantTypeFor(platform, item);

  const { data: saved, error } = await client
    .from("platform_variants")
    .upsert(
      {
        owner_id: ownerId,
        content_item_id: item.id,
        platform,
        variant_type: variantType,
        title: existing
          ? (existing as { title?: string | null }).title
          : item.title,
        caption,
        description:
          platform === "youtube"
            ? caption
            : existing
              ? ((existing as { description?: string | null }).description ??
                null)
              : null,
        hashtags: existing
          ? ((existing as { hashtags?: string[] }).hashtags ?? [])
          : [],
        first_comment: existing
          ? ((existing as { first_comment?: string | null }).first_comment ??
            null)
          : null,
        cta: existing
          ? ((existing as { cta?: string | null }).cta ?? null)
          : null,
        thumbnail_text: existing
          ? ((existing as { thumbnail_text?: string | null }).thumbnail_text ??
            null)
          : null,
        review_state: reviewState,
        approved_at: null,
        approved_by: null,
        approval_hash: null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      },
      { onConflict: "content_item_id,platform,variant_type" },
    )
    .select("id")
    .single();

  if (error || !saved) {
    return { prepared: false, submitted: false, aiFailed: true };
  }

  await client
    .from("ai_generations")
    .update({
      status: "prepared",
      accepted_target_kind: "platform_variant",
      accepted_target_id: (saved as { id: string }).id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", outcome.generationId)
    .eq("owner_id", ownerId)
    .eq("status", "drafted");

  await recordAuditAsWorker(
    client,
    ownerId,
    "ai_generation_prepared",
    "ai_generation",
    outcome.generationId,
    { target: "platform_variant" },
  );

  return {
    prepared: true,
    submitted: submitForReview,
    aiFailed: false,
  };
}

async function prepareVideoDraft(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  script: ScriptRevision | null,
): Promise<boolean> {
  if (!requiresVideo(item)) return false;

  const { data: existing } = await client
    .from("video_projects")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (existing) return false;

  const { data: project, error } = await client
    .from("video_projects")
    .insert({
      owner_id: ownerId,
      content_item_id: item.id,
      name: item.title,
      aspect_ratio:
        item.content_type === "youtube_standard_video" ||
        item.content_type === "youtube_long_video" ||
        item.content_type === "youtube_sleep_video" ||
        item.content_type === "youtube_compilation"
          ? "16:9"
          : "9:16",
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !project) return false;
  const projectId = (project as { id: string }).id;

  const scenes: Record<string, unknown>[] = [];
  let order = 1;

  if (
    item.scripture_reference &&
    item.scripture_text &&
    item.scripture_verification_status === "manually_verified"
  ) {
    scenes.push({
      owner_id: ownerId,
      project_id: projectId,
      scene_order: order++,
      scene_type: "scripture",
      text_source: "content_scripture",
      text_content: null,
      duration_seconds: 8,
      transition: "fade",
      text_position: "centre",
      text_align: "centre",
      text_animation: "fade_in",
    });
  }

  const sceneSpecs = [
    [
      "explanation",
      script?.explanation,
      10,
      "dissolve",
      "centre",
      "centre",
      "rise",
    ],
    [
      "declaration",
      script?.declaration,
      8,
      "dissolve",
      "centre",
      "centre",
      "fade_in",
    ],
    ["prayer", script?.prayer, 10, "dissolve", "centre", "centre", "fade_in"],
    ["outro", script?.outro, 6, "fade", "bottom", "centre", "fade_in"],
  ] as const;

  for (const [
    sceneType,
    text,
    duration,
    transition,
    position,
    align,
    animation,
  ] of sceneSpecs) {
    if (!text) continue;
    scenes.push({
      owner_id: ownerId,
      project_id: projectId,
      scene_order: order++,
      scene_type: sceneType,
      text_source: "script_revision",
      text_content: null,
      duration_seconds: duration,
      transition,
      text_position: position,
      text_align: align,
      text_animation: animation,
    });
  }

  if (scenes.length === 0) {
    await client
      .from("video_projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", ownerId);
    return false;
  }

  const { error: sceneError } = await client
    .from("video_scenes")
    .insert(scenes);
  if (sceneError) {
    await client
      .from("video_projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", ownerId);
    return false;
  }

  return true;
}

async function finishRun(
  client: SupabaseClient,
  ownerId: string,
  runId: string,
  result: OperatorRunResult,
): Promise<OperatorRunResult> {
  const now = new Date().toISOString();
  await client
    .from("automation_runs")
    .update({
      status: result.status,
      completed_at: now,
      summary: result.summary,
      error_detail: result.error,
    })
    .eq("id", runId)
    .eq("owner_id", ownerId);

  await client
    .from("app_settings")
    .update({
      automation_last_run_at: now,
      automation_last_error: result.error,
    })
    .eq("owner_id", ownerId);

  return result;
}

export async function runOperatorPass(
  client: SupabaseClient,
  ownerId: string,
): Promise<OperatorRunResult> {
  const summary = emptySummary();

  const { data: settingsRow } = await client
    .from("app_settings")
    .select(
      "automation_enabled, automation_create_working_drafts, automation_prepare_video_drafts, automation_submit_for_review",
    )
    .eq("owner_id", ownerId)
    .maybeSingle();

  const settings = (settingsRow ?? {
    automation_enabled: false,
    automation_create_working_drafts: true,
    automation_prepare_video_drafts: true,
    automation_submit_for_review: true,
  }) as OperatorSettings;

  const { data: runRow } = await client
    .from("automation_runs")
    .insert({
      owner_id: ownerId,
      status: settings.automation_enabled ? "running" : "disabled",
      summary,
    })
    .select("id")
    .single();

  if (!runRow) {
    return {
      status: "failed",
      summary,
      error: "Operator Mode could not create a run record.",
    };
  }

  const runId = (runRow as { id: string }).id;

  if (!settings.automation_enabled) {
    return finishRun(client, ownerId, runId, {
      status: "disabled",
      summary,
      error: null,
    });
  }

  try {
    const [{ data: itemRows }, { data: plannerRows }] = await Promise.all([
      client
        .from("content_items")
        .select("*")
        .eq("owner_id", ownerId)
        .neq("status", "archived")
        .order("updated_at", { ascending: true })
        .limit(MAX_ITEMS_PER_PASS),
      client
        .from("planner_items")
        .select("*")
        .eq("owner_id", ownerId)
        .in("status", ["idea", "planned", "in_production"]),
    ]);

    const items = (itemRows ?? []) as ContentItem[];
    const plannerItems = (plannerRows ?? []) as PlannerItem[];

    for (const item of items) {
      summary.itemsInspected += 1;

      const hasScripture = Boolean(
        item.scripture_reference?.trim() || item.scripture_text?.trim(),
      );
      if (
        hasScripture &&
        item.scripture_verification_status !== "manually_verified"
      ) {
        summary.blockedUnverifiedScripture += 1;
        continue;
      }

      let script: ScriptRevision | null = null;
      if (settings.automation_create_working_drafts) {
        const { data: before } = await client
          .from("script_revisions")
          .select("*")
          .eq("owner_id", ownerId)
          .eq("content_item_id", item.id)
          .order("revision_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        script = before ? (before as ScriptRevision) : null;

        if (!script) {
          script = await prepareScript(client, ownerId, item);
          if (script) summary.scriptsPrepared += 1;
          else summary.aiFailures += 1;
        }
      }

      let changed = false;
      for (const platform of targetPlatforms(item, plannerItems)) {
        if (!settings.automation_create_working_drafts) break;
        const result = await prepareVariant(
          client,
          ownerId,
          item,
          platform,
          settings.automation_submit_for_review,
        );
        if (result.prepared) {
          summary.variantsPrepared += 1;
          changed = true;
        }
        if (result.submitted) summary.submittedForReview += 1;
        if (result.aiFailed) summary.aiFailures += 1;
      }

      if (
        settings.automation_prepare_video_drafts &&
        (await prepareVideoDraft(client, ownerId, item, script))
      ) {
        summary.videosPrepared += 1;
        changed = true;
      }

      const linkedPlanner = plannerItems.find(
        (candidate) => candidate.content_item_id === item.id,
      );
      if (
        linkedPlanner &&
        changed &&
        linkedPlanner.status !== "in_production"
      ) {
        await client
          .from("planner_items")
          .update({ status: "in_production" })
          .eq("id", linkedPlanner.id)
          .eq("owner_id", ownerId);
      }

      if (!changed) summary.skippedAlreadyComplete += 1;
    }

    return finishRun(client, ownerId, runId, {
      status: "completed",
      summary,
      error: null,
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
    return finishRun(client, ownerId, runId, {
      status: "failed",
      summary,
      error: detail,
    });
  }
}

export async function listOperatorRuns(
  client: SupabaseClient,
  ownerId: string,
  limit = 12,
) {
  const { data } = await client
    .from("automation_runs")
    .select("*")
    .eq("owner_id", ownerId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Compatibility entrypoint used by the dashboard action. */
export async function runOperatorForOwner(
  client: SupabaseClient,
  ownerId: string,
): Promise<OperatorRunResult> {
  return runOperatorPass(client, ownerId);
}

/** Run one pass for every owner who has explicitly enabled Operator Mode. */
export async function runOperatorForEnabledOwners(
  client: SupabaseClient,
): Promise<{ owners: number; completed: number; failed: number }> {
  const { data, error } = await client
    .from("app_settings")
    .select("owner_id")
    .eq("automation_enabled", true);

  if (error) {
    return { owners: 0, completed: 0, failed: 1 };
  }

  const owners = (data ?? []) as { owner_id: string }[];
  let completed = 0;
  let failed = 0;

  for (const row of owners) {
    const result = await runOperatorPass(client, row.owner_id);
    if (result.status === "completed") completed += 1;
    if (result.status === "failed") failed += 1;
  }

  return { owners: owners.length, completed, failed };
}
