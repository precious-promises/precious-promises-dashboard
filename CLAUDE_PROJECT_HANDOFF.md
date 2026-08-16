# CLAUDE PROJECT HANDOFF — Precious Promises Content & Growth Dashboard

**READ THIS FILE BEFORE DOING ANY WORK.**

**Do not infer project state from conversation memory or a temporary Claude
session branch. Verify repository, current branch, git status, main..HEAD and
open PRs against this handoff before making changes.**

---

## Identity

- **Project:** Precious Promises Content & Growth Dashboard
- **Repository:** `precious-promises/precious-promises-dashboard`
- **Owner and approver of record:** Dave, Founder & Creator of Precious
  Promises. Nothing is published, merged into a stage, or advanced to a new
  stage without his explicit instruction.

## Strict separation

- This repository is **separate from the Precious Promises Bible app**. Do not
  import from it, copy its code, or assume shared infrastructure.
- This repository is **separate from Genesis O.S and Genesis Dominion**.
  **Never access, inspect, query or modify Genesis projects or databases**,
  and do not reference them in code, configuration or documentation.

## Current state (as of the Stage 11 merge, 2026-08-16)

- **Main SHA:** `e294dfe` ("Stage 11: complete production automation and
  remaining dashboard modules", squash of PR #14).
- **Stages 0–11 are complete and merged.** All 19 navigation areas are
  genuinely built. There is no open Stage-related PR.
- Stage 11 added:
  - Real Remotion server-side rendering in the background worker path,
    gated by `RENDER_ENABLED`, with crash-safe reconciliation
    (deterministic output key recorded at claim; a crashed worker is
    recovered from the found file or honestly failed as `worker_crashed`)
    and a database that refuses `completed` without a genuine output file.
  - The private `generated-media` storage bucket — owner-prefixed object
    keys, no browser storage policy at all, access only through short-lived
    signed URLs. Google Drive remains read-only.
  - An ElevenLabs narration provider — server-only key, per-model character
    limits enforced before any request, only a voice that already exists in
    the connected account, no cloning or voice-design endpoint anywhere in
    the tree.
  - A Scripture-safe AI drafting provider (Anthropic SDK, structured
    outputs). Output schemas are closed per generation type with **no
    Scripture field**; Scripture reaches the model only as separated
    read-only context. Drafts only — every one awaits a human accept/reject,
    and acceptance flows through the existing revision/variant machinery
    (including approval invalidation). Full per-generation provenance.
  - The four remaining modules: Content Planner (`/dashboard/planner`),
    YouTube & Playlists (`/dashboard/youtube`), Rights & Licences
    (`/dashboard/rights`), Settings (`/dashboard/settings`).
  - The production pipeline, ending at `ready_for_review` — no status names
    or reaches approval, scheduling or publishing.
  - A dashboard truth pass (stale "no publishing integration exists" copy
    removed; platform rows read stored account records).
  - Navigation at **19 of 19** — deliberately no 20th "AI Assistant" area.
- **A final forensic review preceded the merge** and closed four
  ownership/audit gaps found on live inspection (none were BLOCKER-level):
  an AI-generation-failure audit write that could attempt a non-uuid
  `entity_id` when no content item existed (now skipped in that case,
  rather than silently failing); a missing ownership check on the Rights
  register **update** path (the create path already had one); a missing
  ownership check when linking an AI draft into the production pipeline's
  `generating_text` step (the render-link step already had one); and stale
  "Server rendering is not built yet" copy in the render refusal reason.
  Regression tests were added for each; all seven validations and the
  Supabase advisors were rerun clean before merging.

## Honesty boundaries that must survive any future work

- **Implemented ≠ connected ≠ live-verified.** Rendering, voice and AI are
  implemented and tested against mocks. **Zero real calls have been made**
  to ElevenLabs or the AI provider; no render has run on a deployed worker;
  no social account is connected; nothing has ever been published; no
  analytics call has reached a live platform.
- **AI may never** approve, schedule, publish, verify Scripture, edit stored
  verified Scripture, invent a verse, or claim guaranteed outcomes. These are
  enforced structurally (closed schemas, separated read-only Scripture
  context, no code path) and pinned by tests in `tests/unit/ai-safety.test.ts`.
- **The production pipeline ends at `ready_for_review`.** No path exists from
  generation to publication without the human review/approval/scheduling
  steps.
- **Google Drive stays read-only.** The only file store this application
  writes is the private `generated-media` bucket.
- The application and CI stay green with **all** provider credentials unset.

## Platform implementation status

| Platform  | Publishing                                                      | Analytics                                                            |
| --------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| YouTube   | Provider built (`private`/`unlisted` only until Google's audit) | Adapter built; needs the separate `yt-analytics.readonly` grant      |
| Instagram | Provider built (Reels via container flow)                       | Adapter built; no watch time (Meta exposes none)                     |
| TikTok    | Provider built (draft / manual / direct distinctions)           | **Refused** — Research API closed to this product; manual entry only |

## Trigger.dev

Task code is written and type-checked (analytics sync, publishing tasks, and
`render-video`, `render-queue-sweep`, `render-reconcile`) but **no
Trigger.dev project is connected — nothing runs on a schedule**. Manual paths
use the same orchestration directly.

## Database

- **Supabase project ref:** `yrlnahnbwrtmljcbfjdg` (this project and no
  other; never touch Genesis projects).
- Stage 11 migration `20260815090000_create_production_automation.sql` is
  applied remotely: the `generated-media` bucket, provenance columns on
  `media_assets` and `render_jobs`, new tables `voice_jobs`,
  `ai_generations`, `production_jobs`, `planner_items`, `licence_records`,
  `app_settings`, and rebuilt audit constraints. All new tables have RLS;
  voice/AI generation rows are browser-read-only. Security advisors show
  only the five pre-existing intentional `rls_enabled_no_policy` INFO
  notices on worker-only credential/session tables — no new findings from
  Stage 11.

## Outstanding manual work (Dave's, not code)

- Configure real OAuth credentials and connect accounts; grant the YouTube
  analytics scope; pass the Google/TikTok audits where public posting is
  wanted.
- Set `ELEVENLABS_API_KEY`, choose a voice in Settings; set `AI_API_KEY`;
  deploy a worker runtime with Chromium + FFmpeg and set `RENDER_ENABLED=true`;
  connect a Trigger.dev project if scheduled runs are wanted.
- After connecting: live-verify one render, one narration, one AI draft —
  none has ever run for real.

## The exact next authorized action

**Await Dave's instruction.** A finished, merged stage is never permission to
begin further work. Do not start a new stage, do not redesign delivered
stages, and do not add unrelated features.
