import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BIBLE_STUDY_PROMPT_VERSION,
  BIBLE_STUDY_SPECIFICATION_VERSION,
} from "./spec";
import { getBibleStudyProvider } from "./provider";
import { validateBibleStudy } from "./quality";
import type {
  BibleStudyRequest,
  BibleStudyRevisionRecord,
} from "./types";

function stableRequest(request: BibleStudyRequest): string {
  return JSON.stringify({
    provider: request.provider,
    topicOrPassage: request.topicOrPassage.trim().replace(/\s+/g, " "),
    translation: request.translation,
    depth: request.depth,
    audience: request.audience,
    emphasis: request.emphasis.trim().replace(/\s+/g, " "),
    specification: BIBLE_STUDY_SPECIFICATION_VERSION,
    prompt: BIBLE_STUDY_PROMPT_VERSION,
  });
}

export function bibleStudyRequestFingerprint(
  request: BibleStudyRequest,
): string {
  return createHash("sha256").update(stableRequest(request), "utf8").digest("hex");
}

export function bibleStudyContentHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

export async function findReusableBibleStudy(
  client: SupabaseClient,
  ownerId: string,
  request: BibleStudyRequest,
): Promise<BibleStudyRevisionRecord | null> {
  const fingerprint = bibleStudyRequestFingerprint(request);
  const { data } = await client
    .from("bible_study_revisions")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("request_fingerprint", fingerprint)
    .eq("generation_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as BibleStudyRevisionRecord | null) ?? null;
}

export async function generateBibleStudy(
  client: SupabaseClient,
  ownerId: string,
  request: BibleStudyRequest,
  options: { forceRegenerate?: boolean } = {},
): Promise<
  | { ok: true; revision: BibleStudyRevisionRecord; reused: boolean }
  | { ok: false; detail: string }
> {
  if (!options.forceRegenerate) {
    const existing = await findReusableBibleStudy(client, ownerId, request);
    if (existing) {
      return { ok: true, revision: existing, reused: true };
    }
  }

  const { provider, problems } = getBibleStudyProvider(request.provider);
  if (!provider) {
    return { ok: false, detail: problems.join(" ") };
  }

  const result = await provider.generate(request);
  if (!result.ok) {
    return { ok: false, detail: result.detail };
  }

  const validation = validateBibleStudy(request, result.study);
  if (!validation.valid) {
    return {
      ok: false,
      detail: `Bible Study quality control blocked the result: ${validation.blockers.join(" ")}`,
    };
  }

  const requestFingerprint = bibleStudyRequestFingerprint(request);

  const { data: studyRow, error: studyError } = await client
    .from("bible_studies")
    .insert({
      owner_id: ownerId,
      topic_or_passage: request.topicOrPassage,
      translation: request.translation,
      depth: request.depth,
      audience: request.audience,
      emphasis: request.emphasis || null,
      provider_requested: request.provider,
    })
    .select("id")
    .single();

  if (studyError || !studyRow) {
    return { ok: false, detail: "The Bible Study record could not be saved." };
  }

  const studyId = (studyRow as { id: string }).id;
  const { data: latest } = await client
    .from("bible_study_revisions")
    .select("revision_number")
    .eq("study_id", studyId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const revisionNumber =
    ((latest as { revision_number?: number } | null)?.revision_number ?? 0) + 1;

  const canonicalHash = bibleStudyContentHash(result.study);

  const { data: revisionRow, error: revisionError } = await client
    .from("bible_study_revisions")
    .insert({
      owner_id: ownerId,
      study_id: studyId,
      revision_number: revisionNumber,
      request_fingerprint: requestFingerprint,
      content_hash: canonicalHash,
      provider: result.provider,
      model: result.model,
      specification_version: BIBLE_STUDY_SPECIFICATION_VERSION,
      prompt_version: BIBLE_STUDY_PROMPT_VERSION,
      canonical_study: result.study,
      validation_report: validation,
      generation_status: "completed",
      review_state: "draft",
      scripture_verification_status: "verification_required",
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      latency_ms: result.latencyMs,
    })
    .select("*")
    .single();

  if (revisionError || !revisionRow) {
    return {
      ok: false,
      detail: "The generated Bible Study revision could not be saved.",
    };
  }

  await client
    .from("bible_studies")
    .update({ current_revision_number: revisionNumber })
    .eq("id", studyId)
    .eq("owner_id", ownerId);

  return {
    ok: true,
    revision: revisionRow as BibleStudyRevisionRecord,
    reused: false,
  };
}
