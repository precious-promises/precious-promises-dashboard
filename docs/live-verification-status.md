# Live Connection & Verification — Status

The authoritative live-readiness record for the Precious Promises Content &
Growth Dashboard. **Nothing is marked live-verified without recorded
evidence.** This document never contains a secret value; credentials are
reported only as CONFIGURED / NOT CONFIGURED.

- **Phase begun:** 2026-08-16
- **Code state at phase start:** Stages 0–11 complete and merged
  (main `e294dfe`, handoff `8ebf44a`)
- **Supabase project:** precious-promises-dashboard, ref
  `yrlnahnbwrtmljcbfjdg` — this project and no other

## Status vocabulary

- **Implemented** — the code exists on main and is tested against mocks.
- **Configured** — the runtime configuration (credential, setting, runtime)
  genuinely exists where the code reads it.
- **Connected** — the application has genuinely reached the real service.
- **Live-verified** — a real end-to-end operation succeeded and its evidence
  is recorded here.

## Readiness matrix

| #   | Subsystem                     | Implemented                           | Configured | Connected | Live-verified | Blocker                                                                                                |
| --- | ----------------------------- | ------------------------------------- | ---------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| A   | Supabase Auth (owner sign-in) | Yes                                   | **No**     | No        | No            | `auth.users` count is 0 — no owner account exists (verified 2026-08-16)                                |
| B   | Production web deployment     | Yes (app builds; 19 routes)           | **No**     | No        | No            | No deploy config in the repository; no site confirmably linked to this repo                            |
| C   | Trigger.dev                   | Yes (task code + `trigger.config.ts`) | No         | No        | No            | No Trigger.dev project connected; `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` not configured          |
| D   | Render worker (Remotion)      | Yes                                   | No         | No        | No            | No render-capable deployed runtime; `RENDER_ENABLED` and the worker credential not configured anywhere |
| E   | Google / YouTube OAuth        | Yes                                   | No         | No        | No            | No Google Cloud OAuth client configured; needs the deployed redirect URI, so depends on B              |
| F   | Google Drive (read-only)      | Yes                                   | No         | No        | No            | Same Google OAuth client + `GOOGLE_DRIVE_ROOT_FOLDER_ID`                                               |
| G   | YouTube Analytics             | Yes                                   | No         | No        | No            | Separate `yt-analytics.readonly` consent, after E                                                      |
| H   | Meta / Instagram              | Yes                                   | No         | No        | No            | No Meta app configured; publish permission is App-Review-gated                                         |
| I   | TikTok                        | Yes                                   | No         | No        | No            | No TikTok developer app; public direct post additionally audit-gated                                   |
| J   | ElevenLabs                    | Yes                                   | No         | No        | No            | `ELEVENLABS_API_KEY` not configured in any server environment                                          |
| K   | Anthropic AI                  | Yes                                   | No         | No        | No            | `AI_API_KEY` not configured in any server environment                                                  |

## Evidence log

### 2026-08-16 — Phase-start audit

- **Repository state:** branch `main` at `8ebf44a`, clean tree, Stages 0–11
  in history, zero open PRs. Evidence: `git log` / GitHub PR listing.
- **Database state:** live queries against project `yrlnahnbwrtmljcbfjdg`
  (safety check printed): `auth.users` = 0; `social_accounts` = 0;
  `app_settings` = 0; `content_items` = 0; `media_assets` = 0;
  `scheduled_posts` = 0; `render_jobs` = 0; `voice_jobs` = 0;
  `ai_generations` = 0. The production database is empty — consistent with
  the handoff's "zero real calls, nothing published" record.
- **Server environment:** no server secret of any kind is present in the
  development sandbox (only the two public Supabase client values and
  `APP_URL`). No deployment environment exists yet to hold one.
- **Deployment:** the repository contains no `netlify.toml`, `vercel.json`
  or `Dockerfile`; CI (`ci.yml`) is the only workflow. Two Netlify sites
  whose names match "precious" exist on the owner's team
  (`v5-precious-promises`, `precious-promises-v1`); neither is confirmably
  linked to this repository, and they were not inspected further because
  they may belong to the separate Precious Promises Bible app.

## Blocker order (verification sequence)

1. **Supabase owner account** ← current blocker; owner action required
2. Production web deployment (hosts the server environment every provider
   credential lives in)
3. Trigger.dev connection
4. Render worker runtime
5. ElevenLabs key + one controlled narration
6. Anthropic key + one controlled draft
7. Google / YouTube OAuth (+ Drive root, + separate analytics consent)
8. One controlled private YouTube upload through the full human workflow
9. YouTube analytics readback
10. Meta / Instagram connection and one controlled Reel
11. TikTok connection via its safest supported mode
12. Final end-to-end production workflow

Nothing below a blocker is attempted until the blocker above it is genuinely
cleared and evidenced.
