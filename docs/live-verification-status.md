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

| #   | Subsystem                     | Implemented                           | Configured           | Connected | Live-verified | Blocker                                                                                                                   |
| --- | ----------------------------- | ------------------------------------- | -------------------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A   | Supabase Auth (owner sign-in) | Yes                                   | **Yes** (2026-08-16) | No        | No            | Deployment now live; awaiting the owner's first real sign-in (evidence will be `last_sign_in_at`)                         |
| B   | Production web deployment     | Yes (app builds; 19 routes)           | **Yes**              | **Yes**   | **Partial**   | Build published from main with evidence; page rendering confirmed by owner sign-in (sandbox cannot reach `*.netlify.app`) |
| C   | Trigger.dev                   | Yes (task code + `trigger.config.ts`) | No                   | No        | No            | No Trigger.dev project connected; `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` not configured                             |
| D   | Render worker (Remotion)      | Yes                                   | No                   | No        | No            | No render-capable deployed runtime; `RENDER_ENABLED` and the worker credential not configured anywhere                    |
| E   | Google / YouTube OAuth        | Yes                                   | No                   | No        | No            | No Google Cloud OAuth client configured; needs the deployed redirect URI, so depends on B                                 |
| F   | Google Drive (read-only)      | Yes                                   | No                   | No        | No            | Same Google OAuth client + `GOOGLE_DRIVE_ROOT_FOLDER_ID`                                                                  |
| G   | YouTube Analytics             | Yes                                   | No                   | No        | No            | Separate `yt-analytics.readonly` consent, after E                                                                         |
| H   | Meta / Instagram              | Yes                                   | No                   | No        | No            | No Meta app configured; publish permission is App-Review-gated                                                            |
| I   | TikTok                        | Yes                                   | No                   | No        | No            | No TikTok developer app; public direct post additionally audit-gated                                                      |
| J   | ElevenLabs                    | Yes                                   | No                   | No        | No            | `ELEVENLABS_API_KEY` not configured in any server environment                                                             |
| K   | Anthropic AI                  | Yes                                   | No                   | No        | No            | `AI_API_KEY` not configured in any server environment                                                                     |

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

### 2026-08-16 — Netlify site created and configured (B: partially configured)

Performed directly through the connected Netlify tools:

- **Site created:** `precious-promises-dashboard`, id
  `7287fe02-553d-483f-b6c6-977ab43db0c2`, team Genesis OS, URL
  `https://precious-promises-dashboard.netlify.app`. A **new** site — the
  two pre-existing "precious" sites were neither read in detail, modified,
  reused nor redeployed, and no Genesis project was touched.
- **Environment variables — all four CONFIGURED** (verified by reading them
  back; all four are non-secret by design):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NODE_VERSION` = 22, `APP_URL` = the exact assigned site URL. No server
  secret has been placed in this environment yet.
- **Repository link: NOT yet in effect.** `currentDeploy` on the site is
  empty — **no build has ever run**. (The changing
  `branchVersionOfSite` ids are placeholders, not deploys; they 404 when
  queried.)
- **Tooling limits encountered, recorded honestly:** the connected Netlify
  tool surface exposes project/env/forms/extensions/team reads and one
  deploy-write that only performs a _local upload_ via `npx` — which this
  session's permission layer denies. No connected operation links a Git
  repository or edits build settings, and the Netlify REST token is held
  server-side by the connector. Additionally, `*.netlify.app` is blocked by
  this sandbox's egress proxy, so the deployed site cannot be fetched from
  here; deploy state must be read through the Netlify tools or confirmed by
  the owner.

### 2026-08-18 — First production deploy succeeded (B: Connected)

Repository linked by the owner in the Netlify UI (the connected tool surface
exposes no Git-link operation). First production build then ran on Netlify's
own infrastructure. Verified from the deploy record via the Netlify API:

- **Deploy** `6a84a1e646817078b6f04f66`, build `6a84a1e546817078b6f04f64`,
  **state `ready`**, `error_message: null`, `plugin_state: success`,
  build time 67s, published 2026-08-18 18:19:26 UTC.
- **Repository:** commit URL resolves to
  `github.com/precious-promises/precious-promises-dashboard` — the correct
  repository.
- **Branch `main`, context `production`**, `subdomain_alias: main`.
- **Deployed commit `d920124956b26a2f1afcb4b2c253723ddd489182`** — exactly
  current main.
- **HTTPS:** `ssl_url` = `https://precious-promises-dashboard.netlify.app`;
  `APP_URL` matches it exactly.
- **Server rendering genuinely deployed:** `@netlify/plugin-nextjs@5.15.13`
  produced the Next.js Server Handler function on runtime **nodejs22.x**
  (confirming `NODE_VERSION=22` took effect) plus one edge function — so the
  proxy/session path and server actions are deployed, not a static export.
- **Environment variables:** all four still CONFIGURED, re-read after the
  deploy. All four are non-secret by design; **no server secret exists in
  this environment yet**, so no secret can be exposed by it.
- **Isolation:** one site only (no duplicate created, nothing renamed);
  `v5-precious-promises` and `precious-promises-v1` untouched; no Genesis
  project, database, code or secret accessed or modified at any point.

**Not yet verified by me, and deliberately not claimed:** the rendered login
page. This sandbox's egress proxy blocks `*.netlify.app` (confirmed: curl
CONNECT returns 403), so the deployed HTML cannot be fetched from here. The
owner's sign-in is the verification step for it.

**Observation, not a defect:** the GitHub repository is **public**
(`private: false`). No credential is in the repository — `.env*` is
git-ignored, `.env.example` holds placeholder keys with no values, and a unit
test forbids literal credential values in source. Real secrets belong in the
Netlify environment, which is not public. The owner may still wish to make
the repository private as a matter of preference; nothing in this phase
depends on it.

## Blocker order (verification sequence)

1. Supabase owner account — CONFIGURED 2026-08-16
2. Production web deployment — DEPLOYED 2026-08-18 (hosts the server
   environment every provider credential lives in)
3. **Owner sign-in to the deployed dashboard** ← current checkpoint
4. Trigger.dev connection
5. Render worker runtime
6. ElevenLabs key + one controlled narration
7. Anthropic key + one controlled draft
8. Google / YouTube OAuth (+ Drive root, + separate analytics consent)
9. One controlled private YouTube upload through the full human workflow
10. YouTube analytics readback
11. Meta / Instagram connection and one controlled Reel
12. TikTok connection via its safest supported mode
13. Final end-to-end production workflow

Nothing below a blocker is attempted until the blocker above it is genuinely
cleared and evidenced.
