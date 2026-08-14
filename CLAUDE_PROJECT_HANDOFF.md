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

## Current state (as of the Stage 10 merge, 2026-08-14)

- **Main SHA after Stage 10 merge:** `bc4166e00e7ae9e1d0c6b26f4823dd03b47d72b0`
  ("Stage 10: add analytics and growth centre", squash of PR #13)
- **Completed stages:** 0–10.
  - Stage 5: approval, production board and scheduling
  - Stage 6: safe publishing infrastructure
  - Stage 7: YouTube connection and publishing provider
  - Stage 8: media retrieval and Instagram provider
  - Stage 9: TikTok publishing provider
  - Stage 10: Analytics & Growth Centre (including a pre-merge fix commit
    `36643b8`: reachable observation upsert via the `observed_on_utc`
    generated column, a closed provenance gap in the `analytics_metrics`
    update policy, and honest partial-sync reporting)
- **Test counts on main:** 1109 unit tests across 54 files; 14 Playwright E2E
  tests. CI (`Validate`) runs format, lint, typecheck, unit tests and build;
  E2E is deliberately not in CI and runs locally
  (`PLAYWRIGHT_CHROMIUM_EXECUTABLE` may be needed in sandboxes).

## Navigation status

Fifteen areas are built and linkable: Dashboard, Scripture Library, Content
Library, Media Assets, the three writing studios, Video Creation Studio,
Production Board, Calendar, Approval Queue, Publish Queue, Growth Centre,
Analytics, Connected Accounts (plus the Google Drive Browser under Media).
Four remain **coming-soon and unlinkable**: Content Planner, YouTube &
Playlists, Rights & Licences, Settings. The navigation tests enforce that no
unbuilt module is ever linked.

## Platform implementation status

| Platform | Publishing | Analytics |
| --- | --- | --- |
| YouTube | Provider built (upload, thumbnail, playlist; `private`/`unlisted` only — no `public` until Google's audit) | Adapter built. Requires `yt-analytics.readonly`, a **separate explicit grant** — the publishing connection is never read as analytics authorisation |
| Instagram | Provider built (Reels via container flow) | Adapter built. Same connection as publishing; no extra scope; **no watch time** (Meta exposes none) |
| TikTok | Provider built (draft upload / manual post / direct post distinctions) | **Refused** — TikTok's Research API is closed to this product. Manual entry only, permanently labelled manual |

**Connected is not the same as live-verified.** No social account is currently
connected, no OAuth consent screen has been exercised end-to-end against a
real account, and **no analytics call has ever reached a live platform API**.
Every figure on the dashboard today is an honest absence with a stated reason.
Every publish/analytics test runs against a fake platform.

## Outstanding manual connection work (Dave's, not code)

- Configure real OAuth credentials (Google, Meta, TikTok) in the deployment
  platform's secret storage; connect accounts on Connected Accounts.
- For YouTube analytics: add `yt-analytics.readonly` to the Google OAuth
  consent screen, then use the separate "Grant analytics permission" button.
- Google API compliance audit before `public` YouTube uploads can be offered.

## Trigger.dev

Task code is written and type-checked (`analytics-daily-sync` at 05:15 UTC,
`analytics-sync-one`, plus the publishing tasks) but **no Trigger.dev project
is connected — nothing runs on a schedule**. The interface says "Implemented,
not running". Manual "Refresh now" uses the same orchestration directly and
works without the scheduler.

## Database

- **Supabase project ref:** `yrlnahnbwrtmljcbfjdg` (this project and no other;
  never touch Genesis projects)
- Migrations through `20260814090000_fix_analytics_observation_upsert` are
  applied remotely. Security advisor shows only the five intended
  `rls_enabled_no_policy` INFO notices on the credential/session tables that
  are worker-only by design.
- Standing rules: API analytics provenance is enforced by RLS (browser may
  write `source = 'manual'` only); `analytics_sync_runs` is read-only from the
  browser; nothing in the analytics layer deletes snapshots or touches publish
  records.

## Remaining unbuilt modules

Content Planner, YouTube & Playlists, Rights & Licences, Settings — plus AI
generation, media upload and server-side rendering, none of which has a stage
document yet.

## Stage 11: NOT STARTED

**The exact next authorized action is: await Dave's instruction.** A finished
stage is never permission to begin the next one. Do not start Stage 11, do not
redesign delivered stages, and do not add unrelated features.
