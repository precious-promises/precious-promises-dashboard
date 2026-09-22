"use client";

import { useActionState } from "react";

import {
  createBibleStudy,
  type BibleStudyActionState,
} from "@/app/dashboard/bible-study/actions";
import {
  BIBLE_STUDY_AUDIENCE_LABELS,
  BIBLE_STUDY_AUDIENCES,
  BIBLE_STUDY_DEPTH_LABELS,
  BIBLE_STUDY_DEPTHS,
} from "@/lib/bible-study/types";

const initialState: BibleStudyActionState = {};

export function BibleStudyCreateForm({
  anthropicReady,
  openAiReady,
}: {
  anthropicReady: boolean;
  openAiReady: boolean;
}) {
  const [state, action, pending] = useActionState(
    createBibleStudy,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="space-y-1 text-xs text-ink-muted">
          <span>Provider</span>
          <select
            name="provider"
            defaultValue="anthropic"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary"
          >
            <option value="anthropic">
              Claude {anthropicReady ? "· configured" : "· not configured"}
            </option>
            <option value="openai">
              OpenAI {openAiReady ? "· configured" : "· not configured"}
            </option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-muted xl:col-span-2">
          <span>Passage or topic</span>
          <input
            name="topic_or_passage"
            required
            placeholder="Romans 12:1–2 or Renewing the mind"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted"
          />
        </label>
        <label className="space-y-1 text-xs text-ink-muted">
          <span>Translation</span>
          <select
            name="translation"
            defaultValue="BSB"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary"
          >
            <option value="BSB">BSB</option>
            <option value="KJV">KJV</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-muted">
          <span>Depth</span>
          <select
            name="depth"
            defaultValue="standard"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary"
          >
            {BIBLE_STUDY_DEPTHS.map((value) => (
              <option key={value} value={value}>
                {BIBLE_STUDY_DEPTH_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        <label className="space-y-1 text-xs text-ink-muted">
          <span>Audience</span>
          <select
            name="audience"
            defaultValue="general_christian"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary"
          >
            {BIBLE_STUDY_AUDIENCES.map((value) => (
              <option key={value} value={value}>
                {BIBLE_STUDY_AUDIENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-muted">
          <span>Optional emphasis</span>
          <input
            name="emphasis"
            placeholder="e.g. original language, application, sermon preparation"
            className="w-full rounded-lg border border-edge bg-[#070b14] px-3 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted"
          />
        </label>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-200"
        >
          {state.error}
        </p>
      ) : null}
      {state.notice ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100"
        >
          {state.notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-gradient-to-r from-[#6931d6] to-[#7d39e6] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Generating…" : "Generate / Reopen saved"}
        </button>
        <button
          type="submit"
          name="force_regenerate"
          value="true"
          disabled={pending}
          className="rounded-xl border border-edge px-4 py-2.5 text-sm font-semibold text-ink-primary disabled:opacity-50"
        >
          Regenerate intentionally
        </button>
      </div>
      <p className="text-[11px] leading-5 text-ink-muted">
        Exact matching results are reopened instead of regenerated. “Regenerate
        intentionally” is the only path that spends tokens for the same request
        again.
      </p>
    </form>
  );
}
