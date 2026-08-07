# Precious Promises Content & Growth Dashboard

Promises of God.

Internal content and growth dashboard for Precious Promises.
Owner: Dave — Founder & Creator.

> This project is separate from the Precious Promises Bible app, and separate
> from Genesis O.S and Genesis Dominion.

## Status

**Stage 0, Block 3 — Supabase authentication foundation.**

The application now has a Supabase project, email/password sign-in, a protected
`/dashboard`, and a `profiles` table with Row Level Security enforced. It still
has no content features and no working platform integrations.

**It cannot publish content to any platform.** Nothing in it reaches YouTube,
Instagram, TikTok, Google Drive or ElevenLabs.

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

**Implemented:** Supabase project, email/password sign-in and sign-out, a
protected `/dashboard`, and the `profiles` table with RLS.

Everything below is **planned, not built**:

- **No content features.** No content items, media, scheduling or approval —
  `profiles` is the only table that exists.
- **No functional integrations.** No YouTube, Instagram, TikTok, Google Drive,
  ElevenLabs or AI provider. No adapter code exists.
- **No premium dashboard interface.** `/dashboard` is a Stage 0 placeholder
  proving the auth foundation works; none of the approved design system is
  implemented.
- **No publishing.** There is no scheduling, approval, rendering or publishing
  capability of any kind.
- **No user registration, password reset or email flows.**

Integration variables appear in `.env.example` so the shape of future
configuration is agreed. Their presence does not indicate a working integration.

## Documentation

| Document                                            | Covers                                       |
| --------------------------------------------------- | -------------------------------------------- |
| [architecture.md](./docs/architecture.md)           | Modular monolith, planned data and worker    |
| [security.md](./docs/security.md)                   | Secrets, OAuth, access control, auditing     |
| [state-machines.md](./docs/state-machines.md)       | Content and rendering lifecycles             |
| [database-plan.md](./docs/database-plan.md)         | Data models — `profiles` built, rest planned |
| [supabase-setup.md](./docs/supabase-setup.md)       | Project identity, RLS, owner account setup   |
| [api-integrations.md](./docs/api-integrations.md)   | Planned adapters and research rules          |
| [design-system.md](./docs/design-system.md)         | Approved visual direction                    |
| [stage-0-decisions.md](./docs/stage-0-decisions.md) | Stage 0 decisions and reasoning              |

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
    layout.tsx            Root layout
    page.tsx              Placeholder homepage
  lib/
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
