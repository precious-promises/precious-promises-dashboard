# Precious Promises Content & Growth Dashboard

Promises of God.

Internal content and growth dashboard for Precious Promises.
Owner: Dave — Founder & Creator.

> This project is separate from the Precious Promises Bible app, and separate
> from Genesis O.S and Genesis Dominion.

## Status

**Stage 11 — Final production automation.** All 19 navigation areas are built.

The writing half of the workflow is real: Scripture is reviewed and verified,
scripts are written with full revision history, and per-platform captions are
drafted — all under Row Level Security.

Approval, scheduling and the publishing infrastructure are real as of Stages 5
and 6. Stage 7 added Google OAuth and a YouTube provider. Stage 8 added Google
Drive media retrieval — which unblocked YouTube uploads — and an Instagram
Reels provider. Stage 9 added a TikTok provider. Stage 10 added the Analytics &
Growth Centre. Stage 11 added server-side rendering (Remotion, in the
background worker path), ElevenLabs narration, a Scripture-safe AI drafting
provider, private generated-media storage, and the four remaining modules:
Content Planner, YouTube & Playlists, Rights & Licences and Settings.

**Implemented is not connected, and connected is not live-verified.** The
render, voice and AI paths are implemented and tested against mocks; no real
call has been made to ElevenLabs or the AI provider, and no render has run on
a deployed worker. The Settings page reports the truthful per-deployment state
of each.

**Nothing has been published to any platform yet.** All three providers make
real requests and can obtain real media, but no account has been connected and
no post has been created.

**AI drafts only.** Generation happens exclusively on explicit request, every
draft awaits a human accept/reject decision, and the output schemas are closed:
there is no field in which AI could return Scripture, and no code path by which
it could approve, schedule, publish or alter verified verse text.

Two refusals are deliberate and permanent. Instagram publishes **Reels only**:
images, carousels and Stories need media on a publicly reachable URL, and this
application will not expose media to the open internet. TikTok streams bytes
rather than using `PULL_FROM_URL`, for the same reason.

TikTok can also reach two states that are **not** publications — a video in the
creator's drafts, and a post prepared for Dave to make by hand. Both are
reported as what they are, never as success.

Analytics follows the same rule in the other direction: **zero is a
measurement, absence is not**. A metric that has not been fetched, is not
reported by the platform, or is blocked by a missing permission shows a dash
and states the reason — never `0`. TikTok analytics are not built at all,
because the engagement figures live in TikTok's Research API, which is
restricted to qualifying academic institutions. See
[stage-10-analytics-growth.md](./docs/stage-10-analytics-growth.md).

## Current stack

| Concern          | Choice                           |
| ---------------- | -------------------------------- |
| Framework        | Next.js 16 (App Router)          |
| Language         | TypeScript (strict mode)         |
| Styling          | Tailwind CSS v4                  |
| Validation       | Zod                              |
| Auth & database  | Supabase (`@supabase/ssr`)       |
| Unit tests       | Vitest + Testing Library (jsdom) |
| End-to-end tests | Playwright (Chromium)            |
| Linting          | ESLint                           |
| Formatting       | Prettier                         |
| CI               | GitHub Actions                   |
| Icons            | lucide-react                     |
| Package manager  | pnpm                             |

## Requirements

- Node.js 22.22.2 or newer (required by jsdom 30 and undici; Node 20 is
  end-of-life and cannot run the test suite)
- pnpm (pinned via `packageManager`; run `corepack enable` to have it managed
  automatically)

## Installation

```bash
pnpm install
```

## Environment setup

Copy the example file and fill in what you need:

```bash
cp .env.example .env.local
```

`.env.example` contains placeholder keys with **no values** and no credentials.
Real values belong in untracked `.env` files locally, and in the deployment
platform's secret store in production. Every `.env*` file is git-ignored except
`.env.example` itself.

| Variable                                      | Required now        | Notes                                                     |
| --------------------------------------------- | ------------------- | --------------------------------------------------------- |
| `APP_URL`                                     | **Yes**             | Must be a valid http(s) URL                               |
| `NEXT_PUBLIC_SUPABASE_URL`                    | **Yes, to sign in** | Project API URL                                           |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`        | **Yes, to sign in** | Browser-safe key                                          |
| AI, Trigger, Meta, TikTok, Google, ElevenLabs | No                  | Each feature reports "not configured" honestly when unset |
| `RENDER_ENABLED`                              | No                  | Opt-in; needs a runtime with headless Chromium + FFmpeg   |

The application and CI stay green with every provider credential unset — a
missing credential is a truthfully-reported absence, never an error.

The two Supabase values are browser-safe by design; access is constrained by Row
Level Security, not by keeping the key secret. `SUPABASE_SERVICE_ROLE_KEY` is
**not** used anywhere and is not needed to run the app.

The app builds and the test suite passes without any Supabase configuration —
only signing in requires it. Setup details are in
[docs/supabase-setup.md](./docs/supabase-setup.md).

Validation lives in `src/lib/env/`:

- `schema.ts` — schemas and pure parsers, no I/O, safe to import anywhere
- `public.ts` — `NEXT_PUBLIC_*` values only, safe in the browser
- `server.ts` — **server-only** values; never import from a client component

`getServerEnv()` validates lazily and rejects a missing or malformed `APP_URL`
the first time it is called.

## Development

```bash
pnpm dev
```

The app runs at http://localhost:3000.

## Validation commands

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm format:check` | Verify formatting without writing changes |
| `pnpm format`       | Format the repository with Prettier       |
| `pnpm lint`         | Run ESLint                                |
| `pnpm typecheck`    | `next typegen && tsc --noEmit`            |
| `pnpm build`        | Create a production build                 |
| `pnpm start`        | Serve a production build                  |

## Unit and component tests

```bash
pnpm test            # run Vitest once
pnpm test:watch      # run Vitest in watch mode
pnpm test:coverage   # run Vitest with coverage
```

Suites live in `tests/unit/` and cover environment validation, the placeholder
homepage, and the health route handler. They exercise real project code and need
no credentials.

## End-to-end tests

```bash
pnpm test:e2e        # run the Playwright smoke test
pnpm test:e2e:ui     # open the Playwright UI
```

Playwright drives Chromium against the local application; the config starts the
server for you. Install the browser once before the first run:

```bash
pnpm exec playwright install chromium
```

If your environment already ships a compatible Chromium, point Playwright at it
instead of downloading one:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium pnpm test:e2e
```

End-to-end tests are **not** part of the main CI workflow yet — see
[docs/stage-0-decisions.md](./docs/stage-0-decisions.md).

## Authentication

| Route         | Access                                                         |
| ------------- | -------------------------------------------------------------- |
| `/`           | Public placeholder homepage                                    |
| `/api/health` | Public, no session required                                    |
| `/login`      | Private sign-in form; redirects to `/dashboard` when signed in |
| `/dashboard`  | Requires a session; redirects to `/login` otherwise            |

Email and password only, via Supabase Auth. **There is no public sign-up
route** — this is a single-owner dashboard, and the owner account is created
manually in Supabase. See
[docs/supabase-setup.md](./docs/supabase-setup.md#create-the-owner-account).

Sessions are refreshed by `src/proxy.ts` (Next.js 16 renamed `middleware` to
`proxy`). `/dashboard` re-checks the session itself rather than trusting the
proxy alone.

## Health endpoint

```
GET /api/health  →  200
{ "status": "ok", "service": "precious-promises-dashboard" }
```

The response is a fixed, non-sensitive shape. It deliberately exposes no
environment values, versions, paths or infrastructure detail.

## Continuous integration

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`, using
Node.js 22 and pnpm via Corepack:

`pnpm install --frozen-lockfile` → `format:check` → `lint` → `typecheck` →
`test` → `build`

The only variable it sets is `APP_URL=http://localhost:3000`. It uses no
repository secrets.

## Current limitations

**Implemented:** everything in the 19-area navigation — the content, writing,
video, approval, scheduling, publishing, analytics, planning, rights and
settings surfaces, plus server-side rendering, ElevenLabs narration and AI
drafting — all under Row Level Security.

What remains true, and is stated in the product wherever relevant:

- **Rendering is implemented, not enabled.** It runs only where the operator
  sets `RENDER_ENABLED=true` on a runtime with headless Chromium and FFmpeg.
  No render has been live-verified. A request while disabled records a failed
  job with the reason — never a queued one nothing will consume.
- **Voice and AI are implemented, not connected.** No real call has been made
  to ElevenLabs or to the AI provider; both paths are exercised against mocks
  and report "not configured" honestly until credentials exist. Narration uses
  only a voice that already exists in the connected account — nothing creates
  or clones voices, and AI output schemas are closed against Scripture.
- **Generated media is the only file this application writes.** It goes into a
  private bucket, owner-prefixed, reachable only through short-lived signed
  URLs. Uploaded media assets remain metadata records; Google Drive remains
  read-only.
- **No successful publish.** The infrastructure is built, all three publishing
  adapters are real, and media can genuinely be retrieved from Drive — but no
  account has been connected, so nothing has been posted.
- **TikTok direct posting needs TikTok's audit.** Until it passes, an
  unaudited client can only post `SELF_ONLY` — visible to Dave alone. Draft
  uploads and manual posting work regardless, and the interface never offers an
  audience TikTok has not confirmed.
- **Drive access is broader than the folder it uses.** Google offers no
  folder-scoped read scope, so the boundary is enforced in application logic
  and is stated as such rather than presented as a Google guarantee.
- **Instagram publishes Reels only.** Images, carousels and Stories are
  refused: Meta fetches those from a publicly reachable URL, and building an
  endpoint to serve Dave\u2019s media to the open internet is not a trade worth
  making.
- **YouTube cannot upload publicly.** An API client that has not passed Google's
  compliance audit has its uploads forced to private, so only `private` and
  `unlisted` are offered. Scheduled release is not offered for the same reason.
- **No TikTok analytics.** TikTok's Display API returns metadata only; the
  engagement counts are in its Research API, restricted to qualifying academic
  institutions. No connector was built, and figures can only be entered by hand
  and are labelled as manual.
- **YouTube analytics needs a separate consent.** The publishing connection does
  not carry `yt-analytics.readonly`. Connected Accounts offers an explicit
  re-consent; until it is granted, analytics reports the missing permission and
  publishing is unaffected.
- **No analytics have been fetched.** No account is connected, so every figure
  in the Analytics and Growth pages is an absence with a stated reason, and the
  Content Planner shows no data-driven recommendations — it never fabricates
  one from nothing. No analytics call has been verified against a live
  platform. Nothing fabricates views, followers, revenue or engagement.
- **No user registration, password reset or email flows.**

### Deferred verification

**Stage 1 authenticated visual E2E is deferred pending the owner Supabase Auth
account.** The project has no auth users, so no session can be established and
signed-in flows cannot be exercised end to end. Anonymous coverage — every
protected route redirecting to `/login`, public page rendering, the health
endpoint — passes. This is a deferral, not a failure.

Integration variables appear in `.env.example` so the shape of future
configuration is agreed. Their presence does not indicate a working integration.

## Documentation

| Document                                                                                  | Covers                                          |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [architecture.md](./docs/architecture.md)                                                 | Modular monolith, data, worker and adapters     |
| [security.md](./docs/security.md)                                                         | Secrets, OAuth, access control, auditing        |
| [state-machines.md](./docs/state-machines.md)                                             | Content, approval and render job lifecycles     |
| [database-plan.md](./docs/database-plan.md)                                               | Data models — what is built and what is planned |
| [supabase-setup.md](./docs/supabase-setup.md)                                             | Project identity, RLS, owner account setup      |
| [api-integrations.md](./docs/api-integrations.md)                                         | Planned adapters and research rules             |
| [design-system.md](./docs/design-system.md)                                               | Approved visual direction and the locked target |
| [stage-0-decisions.md](./docs/stage-0-decisions.md)                                       | Stage 0 decisions and reasoning                 |
| [stage-1-ui.md](./docs/stage-1-ui.md)                                                     | The dashboard shell and component inventory     |
| [stage-2-content-library.md](./docs/stage-2-content-library.md)                           | Content items, media and the Scripture rule     |
| [stage-3-writing-studios.md](./docs/stage-3-writing-studios.md)                           | Scripture, Script and Caption Studios           |
| [stage-4-video-studio.md](./docs/stage-4-video-studio.md)                                 | Video editor, render model, rendering research  |
| [stage-5-approval-scheduling.md](./docs/stage-5-approval-scheduling.md)                   | Approval fingerprint, board, calendar           |
| [stage-6-publishing-infrastructure.md](./docs/stage-6-publishing-infrastructure.md)       | Queue, claiming, idempotency, safety gate       |
| [stage-7-youtube.md](./docs/stage-7-youtube.md)                                           | Google OAuth, YouTube provider, encryption      |
| [stage-8-media-instagram.md](./docs/stage-8-media-instagram.md)                           | Drive retrieval, root isolation, Instagram      |
| [stage-9-tiktok.md](./docs/stage-9-tiktok.md)                                             | TikTok provider, three honest outcomes          |
| [stage-10-analytics-growth.md](./docs/stage-10-analytics-growth.md)                       | Analytics honesty, Growth Centre evidence rules |
| [stage-11-final-production-automation.md](./docs/stage-11-final-production-automation.md) | Rendering, voice, AI safety, final modules      |

Each document marks implemented and planned work explicitly. They do not claim
that future features already work.

## Project structure

```
src/
  proxy.ts                Session refresh + route protection (Next 16)
  app/
    api/health/route.ts   Health endpoint
    dashboard/            Protected dashboard + logout control
    login/                Private sign-in page, form and server actions
    layout.tsx            Root layout + skip link
    page.tsx              Public landing page
    globals.css           Design tokens and surface treatments
  components/
    accounts/             Connected account cards
    ai/                   AI draft panel (request, accept, reject)
    approvals/            Approval queue rows and review detail
    publish/              Publish queue rows and attempt history
    youtube/              YouTube publishing settings form
    calendar/             Month grid, schedule form, recurring slots
    dashboard/            Shell, sidebar, top bar, cards
    content/              Content forms, filters, item picker
    planner/              Content Planner form
    production/           Production pipeline panel
    rights/               Licence record form
    scripture/            Read-only Scripture panel
    scripts/              Script editor
    settings/             Settings form
    variants/             Caption editor
    video/                Video editor: layers, preview, timeline, inspector
    ui/                   Section card, empty state, status badge
  config/
    navigation.ts         All 19 areas and their availability
    owner.ts              Private owner identity
  lib/
    content/              Types, Zod schemas, verification rule, queries
    scripts/              Script revisions and numbering
    variants/             Platform variants and validation
    approvals/            Fingerprint, eligibility rules, invalidation
    publishing/           Lifecycle, claim, idempotency, safety gate, providers
    accounts/             Connected accounts, encrypted credentials, OAuth state
    crypto/               AES-256-GCM envelope for stored secrets
    drive/                Google Drive retrieval and folder-root isolation
    instagram/            Meta OAuth, container lifecycle, Reels provider
    youtube/              Google OAuth, Data API client, publishing provider
    schedule/             Timezones, recurrence, calendar mapping, safety
    ai/                   Closed output schemas, prompts, Anthropic provider
    analytics/            Providers, sync, readiness, honest metrics
    growth/               Evidence analysis, confidence, experiments
    planner/              Planner vocabulary, views, evidence-backed hints
    render/               Render worker, build-props, reconciliation
    rights/               Licence register vocabulary and warnings
    settings/             Owner preferences and readiness types
    voice/                ElevenLabs provider and voice job orchestration
    audit/                Append-only workflow log
    production/           Stage classification, board data, pipeline machine
    video/                Projects, scenes, preview resolution, render model
    media/                Media types and metadata validation
    storage/              Generated-media storage (private bucket, Stage 11)
  remotion/               The render composition (props, scenes, Root)
  trigger/                Trigger.dev task definitions (written, not connected)
    auth/
      routes.ts           Pure redirect policy
      login-schema.ts     Sign-in input validation
      errors.ts           Safe auth error messages
    env/                  Environment schemas, public and server values
    supabase/
      config.ts           Connection config validation
      client.ts           Browser client
      server.ts           Server client
      proxy.ts            Session refresh
supabase/
  migrations/             SQL migration history
tests/
  unit/                   Vitest suites
  e2e/                    Playwright specs
docs/                     Architecture and planning documents
```
