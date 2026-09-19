import type { SupabaseClient } from "@supabase/supabase-js";

import { runAiGeneration } from "@/lib/ai/generations";
import type { AiGenerationType, ScriptureContext } from "@/lib/ai/types";
import type { ContentItem, ContentType } from "@/lib/content/types";
import type { ScriptRevision } from "@/lib/scripts/types";
import type { VariantPlatform, VariantType } from "@/lib/variants/types";

export interface OperatorRunSummary {
  scanned: number;
  aiDraftsCreated: number;
  variantsCreated: number;
  videoProjectsCreated: number;
  scenesCreated: number;
  submittedForReview: number;
  blockers: Record<string, number>;
}

export interface OperatorRunResult {
  status: "completed" | "disabled" | "failed";
  summary: OperatorRunSummary;
  error: string | null;
}

interface OperatorSettings {
  automation_enabled: boolean;
  automation_create_working_drafts: boolean;
  automation_prepare_video_drafts: boolean;
  automation_submit_for_review: boolean;
}

function emptySummary(): OperatorRunSummary {
  return {
    scanned: 0,
    aiDraftsCreated: 0,
    variantsCreated: 0,
    videoProjectsCreated: 0,
    scenesCreated: 0,
    submittedForReview: 0,
    blockers: {},
  };
}

function addBlocker(summary: OperatorRunSummary, name: string): void {
  summary.blockers[name] = (summary.blockers[name] ?? 0) + 1;
}

function scriptureContext(item: ContentItem): ScriptureContext | null {
  if (
    item.scripture_verification_status !== "manually_verified" ||
    !item.scripture_reference ||
    !item.scripture_text
  ) {
    return null;
  }
  return {
    reference: item.scripture_reference,
    text: item.scripture_text,
    translation: item.scripture_translation,
  };
}

function platformPlan(contentType: ContentType): {
  platform: VariantPlatform;
  variantType: VariantType;
}[] {
  switch (contentType) {
    case "youtube_short":
      return [
        { platform: "youtube", variantType: "youtube_short" },
        { platform: "instagram", variantType: "instagram_reel" },
        { platform: "tiktok", variantType: "tiktok_video" },
      ];
    case "instagram_reel":
    case "tiktok_video":
      return [
        { platform: "youtube", variantType: "youtube_short" },
        { platform: "instagram", variantType: "instagram_reel" },
        { platform: "tiktok", variantType: "tiktok_video" },
      ];
    case "instagram_image":
      return [{ platform: "instagram", variantType: "instagram_image" }];
    case "instagram_carousel":
      return [{ platform: "instagram", variantType: "instagram_carousel" }];
    default:
      return [{ platform: "youtube", variantType: "youtube_video" }];
  }
}

function defaultAspectRatio(contentType: ContentType): "9:16" | "16:9" | "1:1" {
  if (
    contentType === "youtube_short" ||
    contentType === "instagram_reel" ||
    contentType === "tiktok_video"
  ) {
    return "9:16";
  }
  if (contentType === "instagram_image" || contentType === "instagram_carousel") {
    return "1:1";
  }
  return "16:9";
}

function workingMaterial(item: ContentItem, script: ScriptRevision | null): string | null {
  if (script) {
    return ["hook", "explanation", "declaration", "prayer", "outro"]
      .map((key) => {
        const value = script[key as keyof ScriptRevision];
        return typeof value === "string" && value.trim() !== ""
          ? `${key.toUpperCase()}:\n${value}`
          : null;
      })
      .filter((value): value is string => value !== null)
      .join("\n\n");
  }

  return item.topic ? `TOPIC: ${item.topic}` : null;
}

async function hasOpenDraft(
  client: SupabaseClient,
  ownerId: string,
  contentItemId: string,
  type: AiGenerationType,
  platformVariantId: string | null,
): Promise<boolean> {
  let query = client
    .from("ai_generations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("content_item_id", contentItemId)
    .eq("generation_type", type)
    .eq("status", "drafted")
    .limit(1);

  query =
    platformVariantId === null
      ? query.is("platform_variant_id", null)
      : query.eq("platform_variant_id", platformVariantId);

  const { data } = await query;
  return (data ?? []).length > 0;
}

async function createDraftIfMissing(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  script: ScriptRevision | null,
  type: AiGenerationType,
  platform: VariantPlatform | null,
  platformVariantId: string | null,
  instruction: string,
): Promise<boolean> {
  if (
    await hasOpenDraft(client, ownerId, item.id, type, platformVariantId)
  ) {
    return false;
  }

  const outcome = await runAiGeneration(client, {
    ownerId,
    contentItemId: item.id,
    platformVariantId,
    request: {
      type,
      instruction,
      scripture: scriptureContext(item),
      workingMaterial: workingMaterial(item, script),
      platform,
    },
  });

  return outcome.ok;
}

async function ensureVariants(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  summary: OperatorRunSummary,
): Promise<
  {
    id: string;
    platform: VariantPlatform;
    variant_type: VariantType;
    review_state: string;
    title: string | null;
    caption: string | null;
    description: string | null;
  }[]
> {
  const plan = platformPlan(item.content_type);
  const { data: existingRows } = await client
    .from("platform_variants")
    .select("id, platform, variant_type, review_state, title, caption, description")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id);

  const existing = (existingRows ?? []) as {
    id: string;
    platform: VariantPlatform;
    variant_type: VariantType;
    review_state: string;
    title: string | null;
    caption: string | null;
    description: string | null;
  }[];

  for (const target of plan) {
    if (existing.some((row) => row.platform === target.platform)) {
      continue;
    }

    const { data } = await client
      .from("platform_variants")
      .insert({
        owner_id: ownerId,
        content_item_id: item.id,
        platform: target.platform,
        variant_type: target.variantType,
        hashtags: [],
        review_state: "draft",
      })
      .select("id, platform, variant_type, review_state, title, caption, description")
      .single();

    if (data) {
      existing.push(data as (typeof existing)[number]);
      summary.variantsCreated += 1;
    }
  }

  return existing;
}

async function ensureVideoDraft(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  script: ScriptRevision | null,
  summary: OperatorRunSummary,
): Promise<void> {
  if (
    item.content_type === "instagram_image" ||
    item.content_type === "instagram_carousel"
  ) {
    return;
  }

  const { data: existingProject } = await client
    .from("video_projects")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (existingProject) {
    return;
  }

  if (!script) {
    addBlocker(summary, "script_decision_required");
    return;
  }

  const { data: project } = await client
    .from("video_projects")
    .insert({
      owner_id: ownerId,
      content_item_id: item.id,
      name: item.title,
      aspect_ratio: defaultAspectRatio(item.content_type),
      status: "draft",
    })
    .select("id")
    .single();

  if (!project) {
    addBlocker(summary, "video_project_create_failed");
    return;
  }

  summary.videoProjectsCreated += 1;
  let order = 1;

  if (scriptureContext(item)) {
    const { data } = await client
      .from("video_scenes")
      .insert({
        owner_id: ownerId,
        project_id: project.id as string,
        scene_order: order++,
        scene_type: "scripture",
        text_source: "content_scripture",
        duration_seconds: 7,
        transition: "fade",
        text_position: "centre",
        text_align: "centre",
        text_animation: "fade_in",
      })
      .select("id")
      .single();
    if (data) summary.scenesCreated += 1;
  }

  const scenePlan: {
    scene_type: "explanation" | "declaration" | "prayer" | "outro";
    key: keyof Pick<
      ScriptRevision,
      "explanation" | "declaration" | "prayer" | "outro"
    >;
  }[] = [
    { scene_type: "explanation", key: "explanation" },
    { scene_type: "declaration", key: "declaration" },
    { scene_type: "prayer", key: "prayer" },
    { scene_type: "outro", key: "outro" },
  ];

  for (const scene of scenePlan) {
    const value = script[scene.key];
    if (typeof value !== "string" || value.trim() === "") continue;

    const { data } = await client
      .from("video_scenes")
      .insert({
        owner_id: ownerId,
        project_id: project.id as string,
        scene_order: order++,
        scene_type: scene.scene_type,
        text_source: "script_revision",
        duration_seconds: scene.scene_type === "explanation" ? 12 : 7,
        transition: "fade",
        text_position: "centre",
        text_align: "centre",
        text_animation: "fade_in",
      })
      .select("id")
      .single();

    if (data) summary.scenesCreated += 1;
  }
}

async function runItem(
  client: SupabaseClient,
  ownerId: string,
  item: ContentItem,
  settings: OperatorSettings,
  summary: OperatorRunSummary,
): Promise<void> {
  summary.scanned += 1;

  const { data: scriptRow } = await client
    .from("script_revisions")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_item_id", item.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const script = (scriptRow as ScriptRevision | null) ?? null;

  if (
    item.scripture_reference &&
    item.scripture_text &&
    item.scripture_verification_status !== "manually_verified"
  ) {
    addBlocker(summary, "scripture_verification_required");
  }

  if (settings.automation_create_working_drafts) {
    if (!script) {
      const created = await createDraftIfMissing(
        client,
        ownerId,
        item,
        null,
        "script_draft",
        null,
        null,
        "Prepare a clear Precious Promises spoken script draft. Keep Scripture as read-only source material. Do not invent or rewrite Scripture.",
      );
      if (created) summary.aiDraftsCreated += 1;
    }

    const variants = await ensureVariants(client, ownerId, item, summary);

    for (const variant of variants) {
      const draftRequests: {
        type: AiGenerationType;
        instruction: string;
      }[] = [
        {
          type: "title",
          instruction: "Draft a concise platform-appropriate title.",
        },
        {
          type: "caption",
          instruction:
            "Draft a platform-appropriate caption using the saved content and verified Scripture context where available.",
        },
        {
          type: "description",
          instruction:
            "Draft a clear platform description. Do not present generated prose as Scripture.",
        },
        {
          type: "hashtags",
          instruction: "Suggest relevant, restrained hashtags for this content.",
        },
        {
          type: "cta",
          instruction:
            "Draft a short call to action appropriate for Precious Promises.",
        },
      ];

      for (const request of draftRequests) {
        const created = await createDraftIfMissing(
          client,
          ownerId,
          item,
          script,
          request.type,
          variant.platform,
          variant.id,
          request.instruction,
        );
        if (created) summary.aiDraftsCreated += 1;
      }

      if (
        settings.automation_submit_for_review &&
        variant.review_state === "draft" &&
        [variant.title, variant.caption, variant.description].some(
          (value) => (value ?? "").trim() !== "",
        )
      ) {
        const { data } = await client
          .from("platform_variants")
          .update({ review_state: "ready_for_review" })
          .eq("id", variant.id)
          .eq("owner_id", ownerId)
          .eq("review_state", "draft")
          .select("id");

        if ((data ?? []).length > 0) {
          summary.submittedForReview += 1;
        }
      }
    }
  }

  if (settings.automation_prepare_video_drafts) {
    await ensureVideoDraft(client, ownerId, item, script, summary);
  }
}

export async function runOperatorForOwner(
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

  const settings = (settingsRow as OperatorSettings | null) ?? null;

  if (!settings?.automation_enabled) {
    return { status: "disabled", summary, error: null };
  }

  const { data: runRow } = await client
    .from("automation_runs")
    .insert({
      owner_id: ownerId,
      status: "running",
      summary,
    })
    .select("id")
    .single();

  const runId = (runRow as { id: string } | null)?.id ?? null;

  try {
    const { data: itemRows, error } = await client
      .from("content_items")
      .select("*")
      .eq("owner_id", ownerId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    for (const item of (itemRows ?? []) as ContentItem[]) {
      await runItem(client, ownerId, item, settings, summary);
    }

    const completedAt = new Date().toISOString();

    if (runId) {
      await client
        .from("automation_runs")
        .update({
          status: "completed",
          completed_at: completedAt,
          summary,
          error_detail: null,
        })
        .eq("id", runId)
        .eq("owner_id", ownerId);
    }

    await client
      .from("app_settings")
      .update({
        automation_last_run_at: completedAt,
        automation_last_error: null,
      })
      .eq("owner_id", ownerId);

    return { status: "completed", summary, error: null };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";

    if (runId) {
      await client
        .from("automation_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          summary,
          error_detail: detail,
        })
        .eq("id", runId)
        .eq("owner_id", ownerId);
    }

    await client
      .from("app_settings")
      .update({
        automation_last_run_at: new Date().toISOString(),
        automation_last_error: detail,
      })
      .eq("owner_id", ownerId);

    return { status: "failed", summary, error: detail };
  }
}

export async function runOperatorForEnabledOwners(
  client: SupabaseClient,
): Promise<{
  owners: number;
  completed: number;
  failed: number;
}> {
  const { data } = await client
    .from("app_settings")
    .select("owner_id")
    .eq("automation_enabled", true);

  let completed = 0;
  let failed = 0;

  for (const row of (data ?? []) as { owner_id: string }[]) {
    const result = await runOperatorForOwner(client, row.owner_id);
    if (result.status === "completed") completed += 1;
    if (result.status === "failed") failed += 1;
  }

  return {
    owners: (data ?? []).length,
    completed,
    failed,
  };
}
