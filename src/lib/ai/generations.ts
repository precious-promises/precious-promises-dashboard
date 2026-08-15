import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditAsWorker } from "@/lib/audit/repository";

import { PROMPT_TEMPLATE_VERSION } from "./prompts";
import type {
  AiDraftRequest,
  AiDraftResult,
  AiGenerationRecord,
  AiGenerationType,
} from "./types";
import { getAiProvider } from "./provider";

/**
 * Generation provenance.
 *
 * Every run — success or failure — leaves an audit trail; every successful
 * run leaves an `ai_generations` row holding the draft and where it came
 * from. Rows are written under the worker credential (the browser can read,
 * never write), and the status vocabulary is the whole lifecycle: drafted →
 * accepted | rejected, decided by a human through the acceptance actions.
 */

export interface RunGenerationInput {
  ownerId: string;
  contentItemId: string | null;
  platformVariantId: string | null;
  request: AiDraftRequest;
}

export interface RunGenerationOutcome {
  ok: boolean;
  generationId: string | null;
  result: AiDraftResult | null;
  problems: string[];
}

export async function runAiGeneration(
  client: SupabaseClient,
  input: RunGenerationInput,
): Promise<RunGenerationOutcome> {
  const { provider, problems } = getAiProvider();
  if (provider === null) {
    return { ok: false, generationId: null, result: null, problems };
  }

  const result = await provider.generateDraft(input.request);

  if (!result.ok) {
    // A failed generation is a fact worth auditing, but there is no draft to
    // store — an ai_generations row exists only when output exists.
    await recordAuditAsWorker(
      client,
      input.ownerId,
      "ai_generation_failed",
      input.contentItemId ? "ai_generation" : "ai_generation",
      input.contentItemId ?? "none",
      { type: input.request.type, category: result.category },
    );
    return { ok: false, generationId: null, result, problems: [] };
  }

  const { data, error } = await client
    .from("ai_generations")
    .insert({
      owner_id: input.ownerId,
      content_item_id: input.contentItemId,
      platform_variant_id: input.platformVariantId,
      generation_type: input.request.type,
      provider: result.provider,
      model: result.model,
      prompt_template_version: PROMPT_TEMPLATE_VERSION,
      scripture_reference: input.request.scripture?.reference ?? null,
      output: result.output,
      status: "drafted",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      generationId: null,
      result: {
        ok: false,
        category: "unknown",
        detail: "The draft could not be recorded.",
      },
      problems: [],
    };
  }

  const generationId = (data as { id: string }).id;

  await recordAuditAsWorker(
    client,
    input.ownerId,
    "ai_generation_completed",
    "ai_generation",
    generationId,
    { type: input.request.type, model: result.model },
  );

  return { ok: true, generationId, result, problems: [] };
}

export async function loadGeneration(
  client: SupabaseClient,
  ownerId: string,
  generationId: string,
): Promise<AiGenerationRecord | null> {
  const { data } = await client
    .from("ai_generations")
    .select("*")
    .eq("id", generationId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  return (data as AiGenerationRecord | null) ?? null;
}

/** Mark a draft's human decision. Never changes the draft's content. */
export async function markGenerationDecision(
  client: SupabaseClient,
  ownerId: string,
  generationId: string,
  decision:
    | {
        status: "accepted";
        targetKind: "script_revision" | "platform_variant" | "planner_item";
        targetId: string;
      }
    | { status: "rejected" },
): Promise<boolean> {
  const update =
    decision.status === "accepted"
      ? {
          status: "accepted",
          accepted_target_kind: decision.targetKind,
          accepted_target_id: decision.targetId,
          decided_at: new Date().toISOString(),
        }
      : { status: "rejected", decided_at: new Date().toISOString() };

  const { data } = await client
    .from("ai_generations")
    .update(update)
    .eq("id", generationId)
    .eq("owner_id", ownerId)
    .eq("status", "drafted")
    .select("id");

  const changed = (data ?? []).length > 0;
  if (changed) {
    await recordAuditAsWorker(
      client,
      ownerId,
      decision.status === "accepted"
        ? "ai_generation_accepted"
        : "ai_generation_rejected",
      "ai_generation",
      generationId,
      decision.status === "accepted" ? { target: decision.targetKind } : {},
    );
  }
  return changed;
}

/** The drafts awaiting a decision for one content item, newest first. */
export async function listDraftedGenerations(
  client: SupabaseClient,
  ownerId: string,
  contentItemId: string,
  types?: readonly AiGenerationType[],
): Promise<AiGenerationRecord[]> {
  let query = client
    .from("ai_generations")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_item_id", contentItemId)
    .eq("status", "drafted")
    .order("created_at", { ascending: false });

  if (types && types.length > 0) {
    query = query.in("generation_type", [...types]);
  }

  const { data } = await query;
  return (data ?? []) as AiGenerationRecord[];
}
