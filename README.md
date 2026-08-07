# Precious Promises Content & Growth Dashboard

Promises of God.

Internal content and growth dashboard for Precious Promises.
Owner: Dave — Founder & Creator.

> This project is separate from the Precious Promises Bible app, and separate
> from Genesis O.S and Genesis Dominion.

## Status

**Stage 0, Block 2 — testing, CI, environment and documentation foundation.**

This repository currently contains a Next.js application with a placeholder
homepage, typed environment validation, a health endpoint, a test suite and a CI
workflow. It has no database, no authentication and no working integrations.

**It cannot publish content to any platform.** Nothing in it reaches YouTube,
Instagram, TikTok, Google Drive or ElevenLabs.

## Current stack

| Concern          | Choice                           |
| ---------------- | -------------------------------- |
| Framework        | Next.js 16 (App Router)          |
| Language         | TypeScript (strict mode)         |
| Styling          | Tailwind CSS v4                  |
| Validation       | Zod                              |
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

| Variable                                                                | Required now | Notes                       |
| ----------------------------------------------------------------------- | ------------ | --------------------------- |
| `APP_URL`                                                               | **Yes**      | Must be a valid http(s) URL |
| Supabase, AI, Trigger, Meta, TikTok, Google and ElevenLabs placeholders | No           | Unused during Stage 0       |

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

Everything below is **planned, not built**:

- **No database.** No Supabase project, no schema, no migrations.
- **No authentication.** There are no accounts, sessions or sign-in.
- **No functional integrations.** No YouTube, Instagram, TikTok, Google Drive,
  ElevenLabs or AI provider. No adapter code exists.
- **No premium dashboard interface.** The homepage is a placeholder; none of the
  approved design system is implemented.
- **No publishing.** There is no scheduling, approval, rendering or publishing
  capability of any kind.

Integration variables appear in `.env.example` so the shape of future
configuration is agreed. Their presence does not indicate a working integration.

## Documentation

| Document                                            | Covers                                    |
| --------------------------------------------------- | ----------------------------------------- |
| [architecture.md](./docs/architecture.md)           | Modular monolith, planned data and worker |
| [security.md](./docs/security.md)                   | Secrets, OAuth, access control, auditing  |
| [state-machines.md](./docs/state-machines.md)       | Content and rendering lifecycles          |
| [database-plan.md](./docs/database-plan.md)         | Planned models (none implemented)         |
| [api-integrations.md](./docs/api-integrations.md)   | Planned adapters and research rules       |
| [design-system.md](./docs/design-system.md)         | Approved visual direction                 |
| [stage-0-decisions.md](./docs/stage-0-decisions.md) | Stage 0 decisions and reasoning           |

These describe the approved **future** architecture. They do not claim that
future features already work.

## Project structure

```
src/
  app/
    api/health/route.ts   Health endpoint
    layout.tsx            Root layout
    page.tsx              Placeholder homepage
    globals.css           Tailwind entry point and theme tokens
  lib/env/
    schema.ts             Schemas and pure parsers
    public.ts             Client-safe values
    server.ts             Server-only values
tests/
  unit/                   Vitest suites
  e2e/                    Playwright specs
docs/                     Architecture and planning documents
```
