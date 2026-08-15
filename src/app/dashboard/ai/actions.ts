"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { syncApprovalsForItem } from "@/lib/approvals/invalidate";
import { recordAudit } from "@/lib/audit/repository";
import { LOGIN_PATH } from "@/lib/auth/routes";
import type { ContentItem } from "@/lib/content/types";
import {
  listDraftedGenerations,
  loadGeneration,
  markGenerationDecision,
  runAiGeneration,
} from "@/lib/ai/generations";
import {
  AI_GENERATION_TYPES,
  SCRIPT_GENERATION_TYPES,
  VARIANT_GENERATION_TYPES,
  type AiGenerationType,
  type ScriptureContext,
} from "@/lib/ai/types";
import { nextRevisionNumberFor } from "@/lib/scripts/repository";
import type { ScriptRevision } from "@/lib/scripts/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createWorkerClient } from "@/lib/supabase/worker";
import type { VariantPlatform } from "@/lib/variants/types";

/**
 * AI assistance actions.
 *
 * The shape of every path here: a human asks, the provider drafts, the draft
 * is recorded, and a **separate human decision** accepts or rejects it.
 * Acceptance flows through the existing machinery — a new script revision via
 * the same INSERT path the studio uses, a variant update that runs the same
 * approval invalidation as a hand edit. Nothing is generated unrequested,
 * nothing overwrites silently, and nothing here approaches approval,
 * scheduling or publishing.
 */

export interface AiActionState {
  error?: string;
  notice?: string;
}

function scriptureContextFrom(item: ContentItem): ScriptureContext | null {
  if (!item.scripture_reference || !item.scripture_text) {
    return null;
  }
  return {
    reference: item.scripture_reference,
    text: item.scripture_text,
    translation: item.scripture_translation,
  };
}

function isGenerationType(value: unknown): value is AiGenerationType {
  return (
    typeof value === "string" &&
    (AI_GENERATION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Request a draft. Explicitly, always — this action only runs because Dave
 * pressed a button that names what he wants drafted.
 */
export async function requestAiDraft(
  _previous: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const contentItemId = formData.get("content_item_id");
  const generationType = formData.get("generation_type");
  const instruction = formData.get("instruction");
  const platformRaw = formData.get("platform");

  if (typeof contentItemId !== "string" || contentItemId === "") {
    return { error: "Choose a content item first." };
  }
  if (!isGenerationType(generationType)) {
    return { error: "That draft type could not be recognised." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { data: itemRow } = await supabase
    .from("content_items")
    .select("*")
    .eq("id", contentItemId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!itemRow) {
    return { error: "That content item could not be found." };
  }
  const item = itemRow as ContentItem;

  // The latest script is the working material for script-shaped drafts.
  const { data: latestScript } = await supabase
    .from("script_revisions")
    .select("*")
    .eq("content_item_id", contentItemId)
    .eq("owner_id", user.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const script = (latestScript as ScriptRevision | null) ?? null;
  const workingMaterial = script
    ? ["hook", "explanation", "declaration", "prayer", "outro"]
        .map((section) => {
          const value = script[section as keyof ScriptRevision];
          return typeof value === "string" && value.trim() !== ""
            ? `${section.toUpperCase()}:\n${value}`
            : null;
        })
        .filter((part): part is string => part !== null)
        .join("\n\n")
    : item.topic
      ? `TOPIC: ${item.topic}`
      : null;

  const platform =
    platformRaw === "youtube" ||
    platformRaw === "instagram" ||
    platformRaw === "tiktok"
      ? (platformRaw as VariantPlatform)
      : null;

  const { client } = createWorkerClient();
  if (client === null) {
    return {
      error:
        "No trusted worker credential is configured, so drafts cannot be recorded.",
    };
  }

  await recordAudit("ai_generation_requested", "ai_generation", contentItemId, {
    type: generationType,
  });

  const outcome = await runAiGeneration(client, {
    ownerId: user.id,
    contentItemId,
    platformVariantId: null,
    request: {
      type: generationType,
      instruction: typeof instruction === "string" ? instruction : "",
      scripture: scriptureContextFrom(item),
      workingMaterial,
      platform,
    },
  });

  if (!outcome.ok) {
    const detail =
      outcome.result && !outcome.result.ok
        ? outcome.result.detail
        : outcome.problems.join(" ");
    return {
      error:
        detail === ""
          ? "The draft could not be generated."
          : `The draft could not be generated. ${detail}`,
    };
  }

  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/captions");
  return {
    notice:
      "Draft ready below. It is generated content — nothing changes until you accept it.",
  };
}

/**
 * Accept a drafted generation.
 *
 * Script-shaped drafts become a **new revision** through the same INSERT the
 * studio uses; variant-shaped drafts update the variant and run the same
 * approval invalidation a hand edit runs. The generation record points at
 * what the acceptance created.
 */
export async function acceptAiGeneration(
  _previous: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const generationId = formData.get("generation_id");
  if (typeof generationId !== "string" || generationId === "") {
    return { error: "That draft could not be found." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return { error: "No trusted worker credential is configured." };
  }

  const generation = await loadGeneration(client, user.id, generationId);
  if (generation === null || generation.status !== "drafted") {
    return { error: "That draft is not awaiting a decision." };
  }

  // --- Script-shaped: a new revision candidate, never an overwrite. -------
  if (SCRIPT_GENERATION_TYPES.includes(generation.generation_type)) {
    if (generation.content_item_id === null) {
      return { error: "This draft is not attached to a content item." };
    }

    const { data: latest } = await supabase
      .from("script_revisions")
      .select("*")
      .eq("content_item_id", generation.content_item_id)
      .eq("owner_id", user.id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const base = (latest as ScriptRevision | null) ?? null;
    const output = generation.output as Partial<
      Pick<
        ScriptRevision,
        "hook" | "explanation" | "declaration" | "prayer" | "outro"
      >
    >;

    const revisionNumber = await nextRevisionNumberFor(
      generation.content_item_id,
    );

    const { data: inserted, error } = await supabase
      .from("script_revisions")
      .insert({
        owner_id: user.id,
        content_item_id: generation.content_item_id,
        revision_number: revisionNumber,
        // Sections the draft rewrote replace; the rest carry forward from
        // the latest revision so the new candidate is complete.
        hook: output.hook ?? base?.hook ?? null,
        explanation: output.explanation ?? base?.explanation ?? null,
        declaration: output.declaration ?? base?.declaration ?? null,
        prayer: output.prayer ?? base?.prayer ?? null,
        outro: output.outro ?? base?.outro ?? null,
        // Provenance in the revision itself, so an AI-assisted revision is
        // distinguishable in the studio without implying it is approved.
        notes: `AI-assisted draft (${generation.provider} ${generation.model}, template ${generation.prompt_template_version}). Accepted by the owner as revision ${revisionNumber}.`,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return { error: "The new revision could not be created." };
    }

    await markGenerationDecision(client, user.id, generationId, {
      status: "accepted",
      targetKind: "script_revision",
      targetId: (inserted as { id: string }).id,
    });

    revalidatePath("/dashboard/scripts");
    return {
      notice: `Accepted as revision ${revisionNumber}. The previous revisions are untouched.`,
    };
  }

  // --- Variant-shaped: the same path as a hand edit, invalidation included.
  if (VARIANT_GENERATION_TYPES.includes(generation.generation_type)) {
    const variantId = formData.get("platform_variant_id");
    if (typeof variantId !== "string" || variantId === "") {
      return { error: "Choose which variant this draft should update." };
    }

    const { data: variantRow } = await supabase
      .from("platform_variants")
      .select("id, content_item_id")
      .eq("id", variantId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!variantRow) {
      return { error: "That variant could not be found." };
    }

    const fieldByType: Partial<Record<AiGenerationType, string>> = {
      title: "title",
      description: "description",
      caption: "caption",
      cta: "cta",
      hashtags: "hashtags",
    };
    const field = fieldByType[generation.generation_type];
    if (!field) {
      return { error: "That draft type cannot update a variant." };
    }

    const value = (generation.output as Record<string, unknown>)[field];

    const { error } = await supabase
      .from("platform_variants")
      .update({ [field]: value })
      .eq("id", variantId)
      .eq("owner_id", user.id);

    if (error) {
      return { error: "The variant could not be updated." };
    }

    // Exactly what a hand edit does: the fingerprint is recomputed, and an
    // approval that no longer describes the content is withdrawn.
    await syncApprovalsForItem(
      (variantRow as { content_item_id: string }).content_item_id,
    );

    await markGenerationDecision(client, user.id, generationId, {
      status: "accepted",
      targetKind: "platform_variant",
      targetId: variantId,
    });

    revalidatePath("/dashboard/captions");
    revalidatePath("/dashboard/approvals");
    return {
      notice:
        "Accepted into the variant. If the variant was approved, that approval has been invalidated — the content changed.",
    };
  }

  // --- Plan notes: text into the named planner item. ----------------------
  if (generation.generation_type === "plan_note") {
    const plannerItemId = formData.get("planner_item_id");
    if (typeof plannerItemId !== "string" || plannerItemId === "") {
      return { error: "Choose which plan item this note belongs to." };
    }

    const note = (generation.output as { note?: string }).note ?? "";
    const { error } = await supabase
      .from("planner_items")
      .update({ notes: note.slice(0, 2000) })
      .eq("id", plannerItemId)
      .eq("owner_id", user.id);

    if (error) {
      return { error: "The plan note could not be updated." };
    }

    await markGenerationDecision(client, user.id, generationId, {
      status: "accepted",
      targetKind: "planner_item",
      targetId: plannerItemId,
    });

    revalidatePath("/dashboard/planner");
    return { notice: "Accepted into the plan note." };
  }

  return { error: "That draft type has no acceptance path." };
}

export async function rejectAiGeneration(
  _previous: AiActionState,
  formData: FormData,
): Promise<AiActionState> {
  const generationId = formData.get("generation_id");
  if (typeof generationId !== "string" || generationId === "") {
    return { error: "That draft could not be found." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return { error: "No trusted worker credential is configured." };
  }

  const changed = await markGenerationDecision(client, user.id, generationId, {
    status: "rejected",
  });

  revalidatePath("/dashboard/scripts");
  revalidatePath("/dashboard/captions");
  return changed
    ? { notice: "Draft rejected. Nothing was changed by it." }
    : { error: "That draft is not awaiting a decision." };
}

/** The drafts awaiting decision for an item, for the studio panels. */
export async function draftedGenerationsFor(contentItemId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { client } = createWorkerClient();
  if (client === null) {
    return [];
  }

  return listDraftedGenerations(client, user.id, contentItemId);
}
