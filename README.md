# Precious Promises Content & Growth Dashboard

Promises of God.

Internal content and growth dashboard for Precious Promises.
Owner: Dave — Founder & Creator.

> This project is separate from the Precious Promises Bible app, and separate
> from Genesis O.S and Genesis Dominion.

## Status

**Stage 3 — Scripture, Script and Caption Studios.**

The writing half of the workflow is real: Scripture is reviewed and verified,
scripts are written with full revision history, and per-platform captions are
drafted — all under Row Level Security.

Approval, scheduling and the publishing infrastructure are real as of Stages 5
and 6. Stage 7 added a genuine Google OAuth 2.0 connection and a YouTube Data
API v3 publishing provider.

Still absent: AI generation, server rendering, media retrieval, analytics, and
the Instagram and TikTok integrations.

**Nothing has been published to any platform.** The YouTube provider makes real
requests, but the upload path refuses with `media_source_unavailable`: media is
stored as metadata describing a file held elsewhere, and no integration
retrieves the file. Nothing in this repository reaches Instagram, TikTok,
Google Drive or ElevenLabs at all.

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

| Variable                                      | Required now        | Notes                       |
| --------------------------------------------- | ------------------- | --------------------------- |
| `APP_URL`                                     | **Yes**             | Must be a valid http(s) URL |
| `NEXT_PUBLIC_SUPABASE_URL`                    | **Yes, to sign in** | Project API URL             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`        | **Yes, to sign in** | Browser-safe key            |
| AI, Trigger, Meta, TikTok, Google, ElevenLabs | No                  | Unused during Stage 0       |

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

**Implemented:** Supabase project, email/password sign-in and sign-out, the
premium responsive dashboard shell, the Content Library with Scripture
verification, the Scripture, Script and Caption Studios, and media asset
metadata — all under Row Level Security.

Everything below is **planned, not built**:

- **No file upload.** Media assets are metadata records; no bytes move.
- **One functional integration.** Stage 7 built Google OAuth and a YouTube
  provider; Instagram, TikTok, Google Drive, ElevenLabs and the AI provider are
  not implemented. The storage seam is declared, not implemented.
- **No successful publish.** The publishing infrastructure — queue, atomic
  claiming, idempotency, attempt history and the execution-time safety gate —
  is built, and the YouTube adapter is real. **It stops before uploading**,
  because `resolveMediaSource` cannot obtain the video file and returns
  `media_source_unavailable`. That refusal is recorded, not papered over.
- **YouTube cannot upload publicly.** An API client that has not passed Google's
  compliance audit has its uploads forced to private, so only `private` and
  `unlisted` are offered. Scheduled release is not offered for the same reason.
- **No rendering.** The video studio composes and previews; server rendering is
  designed and not connected.
- **No analytics.** Content, approval and schedule counts are real database
  queries; publishing metrics stay at zero because nothing has been published.
  Nothing fabricates views, followers, revenue or engagement.
- **No AI generation.** The Script Studio's "Generate with AI" control is a
  genuinely disabled button marking where it will go.
- **7 of 19 navigation areas are unbuilt** and marked as such, with no `href`.
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

| Document                                                                            | Covers                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| [architecture.md](./docs/architecture.md)                                           | Modular monolith, data, worker and adapters     |
| [security.md](./docs/security.md)                                                   | Secrets, OAuth, access control, auditing        |
| [state-machines.md](./docs/state-machines.md)                                       | Content, approval and render job lifecycles     |
| [database-plan.md](./docs/database-plan.md)                                         | Data models — what is built and what is planned |
| [supabase-setup.md](./docs/supabase-setup.md)                                       | Project identity, RLS, owner account setup      |
| [api-integrations.md](./docs/api-integrations.md)                                   | Planned adapters and research rules             |
| [design-system.md](./docs/design-system.md)                                         | Approved visual direction and the locked target |
| [stage-0-decisions.md](./docs/stage-0-decisions.md)                                 | Stage 0 decisions and reasoning                 |
| [stage-1-ui.md](./docs/stage-1-ui.md)                                               | The dashboard shell and component inventory     |
| [stage-2-content-library.md](./docs/stage-2-content-library.md)                     | Content items, media and the Scripture rule     |
| [stage-3-writing-studios.md](./docs/stage-3-writing-studios.md)                     | Scripture, Script and Caption Studios           |
| [stage-4-video-studio.md](./docs/stage-4-video-studio.md)                           | Video editor, render model, rendering research  |
| [stage-5-approval-scheduling.md](./docs/stage-5-approval-scheduling.md)             | Approval fingerprint, board, calendar           |
| [stage-6-publishing-infrastructure.md](./docs/stage-6-publishing-infrastructure.md) | Queue, claiming, idempotency, safety gate       |
| [stage-7-youtube.md](./docs/stage-7-youtube.md)                                     | Google OAuth, YouTube provider, encryption      |

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
    approvals/            Approval queue rows and review detail
    publish/              Publish queue rows and attempt history
    youtube/              YouTube publishing settings form
    calendar/             Month grid, schedule form, recurring slots
    dashboard/            Shell, sidebar, top bar, cards
    content/              Content forms, filters, item picker
    scripture/            Read-only Scripture panel
    scripts/              Script editor
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
    youtube/              Google OAuth, Data API client, publishing provider
    schedule/             Timezones, recurrence, calendar mapping, safety
    audit/                Append-only workflow log
    production/           Workflow stage classification and board data
    video/                Projects, scenes, preview resolution, render model
    media/                Media types and metadata validation
    storage/              StorageProvider seam (no implementation)
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
