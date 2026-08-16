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

## Current state (as of Stage 11 implementation, 2026-08-15)

- **Main SHA:** `d49c3c4` (Stage 10 merged as
  `bc4166e00e7ae9e1d0c6b26f4823dd03b47d72b0`, then the handoff commit).
- **Stage 11 is IMPLEMENTED but NOT MERGED.** It lives on branch
  `claude/dashboard-stage-11` with an open PR titled
  **"Stage 11: complete production automation and remaining dashboard
  modules"**. Do not merge it without Dave's explicit instruction. Main does
  not contain Stage 11.
- **Completed (merged) stages:** 0–10.
- **Stage 11 (on the branch) adds:** real Remotion server-side rendering in
  the background worker path (gated by `RENDER_ENABLED`, crash-safe
  reconciliation, completed-requires-file); the private `generated-media`
  storage bucket (owner-prefixed keys, signed URLs only, no browser policy);
  an ElevenLabs narration provider (server-only key, existing voices only, no
  cloning anywhere); a Scripture-safe AI drafting provider (Anthropic SDK,
  closed output schemas with no Scripture field, drafts only, human
  accept/reject, provenance records); AI panels in the Script and Caption
  Studios; the Content Planner (`/dashboard/planner`), YouTube & Playlists
  workspace (`/dashboard/youtube`), Rights & Licences register
  (`/dashboard/rights`) and Settings (`/dashboard/settings`); the production
  pipeline ending at `ready_for_review`; a dashboard truth pass (stale "no
  publishing integration exists" copy removed, platform rows read stored
  accounts); and navigation at **19 of 19** areas — deliberately no 20th "AI
  Assistant" area.

## Honesty boundaries that must survive any future work

- **Implemented ≠ connected ≠ live-verified.** Rendering, voice and AI are
  implemented and tested against mocks. **Zero real calls** have been made to
  ElevenLabs or the AI provider; no render has run on a deployed worker; no
  social account is connected; nothing has ever been published; no analytics
  call has reached a live platform.
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
| --------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| YouTube   | Provider built (`private`/`unlisted` only until Google's audit) | Adapter built; needs the separate `yt-analytics.readonly` grant      |
| Instagram | Provider built (Reels via container flow)                       | Adapter built; no watch time (Meta exposes none)                     |
| TikTok    | Provider built (draft / manual / direct distinctions)           | **Refused** — Research API closed to this product; manual entry only |

## Trigger.dev

Task code is written and type-checked (analytics sync, publishing tasks, and
now `render-video`, `render-queue-sweep`, `render-reconcile`) but **no
Trigger.dev project is connected — nothing runs on a schedule**. Manual paths
use the same orchestration directly.

## Database

- **Supabase project ref:** `yrlnahnbwrtmljcbfjdg` (this project and no other;
  never touch Genesis projects).
- Stage 11 migration `20260815090000_create_production_automation.sql` is on
  the branch and applied remotely: `generated-media` bucket, provenance
  columns on `media_assets` and `render_jobs`, new tables `voice_jobs`,
  `ai_generations`, `production_jobs`, `planner_items`, `licence_records`,
  `app_settings`, and rebuilt audit constraints. All new tables have RLS;
  voice/AI generation rows are browser-read-only.

## Outstanding manual work (Dave's, not code)

- Configure real OAuth credentials and connect accounts; grant the YouTube
  analytics scope; pass the Google/TikTok audits where public posting is
  wanted.
- Set `ELEVENLABS_API_KEY`, choose a voice in Settings; set `AI_API_KEY`;
  deploy a worker runtime with Chromium + FFmpeg and set `RENDER_ENABLED=true`;
  connect a Trigger.dev project if scheduled runs are wanted.
- After connecting: live-verify one render, one narration, one AI draft — none
  has ever run for real.

## The exact next authorized action

**Await Dave's decision on the open Stage 11 PR.** A finished stage is never
permission to begin further work. Do not merge, do not redesign delivered
stages, and do not add unrelated features.
