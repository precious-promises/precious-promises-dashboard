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

| #   | Subsystem                     | Implemented                           | Configured           | Connected | Live-verified | Blocker                                                                                                |
| --- | ----------------------------- | ------------------------------------- | -------------------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| A   | Supabase Auth (owner sign-in) | Yes                                   | **Yes** (2026-08-16) | No        | No            | Sign-in not yet possible: no deployment exists to sign into (depends on B)                             |
| B   | Production web deployment     | Yes (app builds; 19 routes)           | **No**               | No        | No            | No deploy config in the repository; no site confirmably linked to this repo                            |
| C   | Trigger.dev                   | Yes (task code + `trigger.config.ts`) | No                   | No        | No            | No Trigger.dev project connected; `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` not configured          |
| D   | Render worker (Remotion)      | Yes                                   | No                   | No        | No            | No render-capable deployed runtime; `RENDER_ENABLED` and the worker credential not configured anywhere |
| E   | Google / YouTube OAuth        | Yes                                   | No                   | No        | No            | No Google Cloud OAuth client configured; needs the deployed redirect URI, so depends on B              |
| F   | Google Drive (read-only)      | Yes                                   | No                   | No        | No            | Same Google OAuth client + `GOOGLE_DRIVE_ROOT_FOLDER_ID`                                               |
| G   | YouTube Analytics             | Yes                                   | No                   | No        | No            | Separate `yt-analytics.readonly` consent, after E                                                      |
| H   | Meta / Instagram              | Yes                                   | No                   | No        | No            | No Meta app configured; publish permission is App-Review-gated                                         |
| I   | TikTok                        | Yes                                   | No                   | No        | No            | No TikTok developer app; public direct post additionally audit-gated                                   |
| J   | ElevenLabs                    | Yes                                   | No                   | No        | No            | `ELEVENLABS_API_KEY` not configured in any server environment                                          |
| K   | Anthropic AI                  | Yes                                   | No                   | No        | No            | `AI_API_KEY` not configured in any server environment                                                  |

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

### 2026-08-16 — Supabase owner account created (A: Configured)

- First attempt landed in a different Supabase project: re-verification
  found `auth.users` still 0 here, and the owner corrected it. Recorded
  because the safety check exists for exactly this failure.
- Verified against project `yrlnahnbwrtmljcbfjdg` (safety check printed):
  `auth.users` = 1; email matches the owner-stated address; account
  confirmed; created 2026-08-16 12:25 UTC. **Supabase Auth: CONFIGURED.**
  Connected/live-verified awaits a real sign-in through the deployed
  dashboard; the evidence for that will be a populated `last_sign_in_at`.

### 2026-08-16 — Deployment research (B, before owner action)

- The architecture docs are deliberately platform-agnostic ("one deployable
  Next.js application").
- Current official Netlify position (docs.netlify.com is egress-blocked
  from this environment; verified via the Context7 documentation index and
  the runtime's own README on GitHub): Next.js runs through the OpenNext
  adapter, supported for "Next.js 13.5 or later", "tested against every
  Next.js release"; the legacy runtime applies only below 13.5. This app is
  Next.js 16.3.0, inside the stated range. Node version is set per-site via
  `NODE_VERSION` (this app requires ≥ 22.22.2, satisfied by `22`).
- **Recommendation: a new Netlify site**, because the owner's team already
  operates on Netlify and this session holds read access to verify deploys
  directly. The two existing "precious" sites are NOT to be reused or
  modified — they are not confirmably this repository's and may belong to
  the separate Bible app. The first deploy needs only the three non-secret
  environment values (Supabase URL, publishable key, `APP_URL`) plus
  `NODE_VERSION` — no secret is required for checkpoint B.

## Blocker order (verification sequence)

1. Supabase owner account — CONFIGURED 2026-08-16
2. **Production web deployment** ← current blocker; owner action required (hosts the server environment every provider
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
