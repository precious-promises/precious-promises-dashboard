# Architecture

> **Status: partly implemented.** The application shell, environment handling,
> Supabase authentication and the `profiles` table are built. Everything else
> records approved direction only. Sections describing future work are marked
> _(planned)_; see [What exists today](#what-exists-today) for the summary.

## Shape: a modular monolith

The dashboard is built as a **modular monolith** — one deployable Next.js
application, internally divided into modules with explicit boundaries.

Modules own their domain logic and expose a narrow interface to the rest of the
app. Cross-module access goes through those interfaces rather than reaching into
another module's internals, so a module can later be extracted into its own
service if it ever needs to be.

**No microservices during the MVP.** A single owner running a single workload
does not have the operational scale to justify separate services, and the
distribution cost — deployment surface, network failure modes, tracing — would
be paid immediately for a benefit that is entirely hypothetical. See
[stage-0-decisions.md](./stage-0-decisions.md) for the full reasoning.

## Application layer — Next.js App Router

**Implemented.** The application uses the Next.js App Router with TypeScript in
strict mode.

- Server Components are the default. Client Components are opt-in, and used only
  where interactivity requires them.
- Route handlers under `src/app/api/` serve machine-readable endpoints. The only
  one that exists today is `GET /api/health`.
- Mutations use Server Actions — sign-in and sign-out are both actions.
- The interface layer is documented separately in
  [stage-1-ui.md](./stage-1-ui.md). Server Components are the default there
  too: the mobile navigation drawer is the only Client Component in the app.

## Secrets stay on the server

**Implemented.** Configuration is split at the module level:

| Module                  | Contains                       | Safe in the browser |
| ----------------------- | ------------------------------ | ------------------- |
| `src/lib/env/schema.ts` | Validation logic only, no I/O  | Yes                 |
| `src/lib/env/public.ts` | `NEXT_PUBLIC_*` values         | Yes                 |
| `src/lib/env/server.ts` | Server-only values and secrets | **No**              |

There is deliberately no barrel module re-exporting both halves, because a
barrel makes it trivially easy to pull a server secret into a client bundle.
Access tokens for third-party platforms will be held server-side only and never
sent to the browser _(planned)_.

## Data and storage

### Supabase — Auth, Postgres and metadata _(partly implemented)_

Supabase provides authentication and the Postgres database, and will hold all
structured metadata: content items, schedules, publish attempts, approval
actions and audit records.

**Implemented in Block 3:**

- A dedicated Supabase project, `precious-promises-dashboard`
  (ref `yrlnahnbwrtmljcbfjdg`, region `eu-west-2`)
- Email/password authentication with server-side session handling
- The `profiles` table, with Row Level Security enabled and per-user policies

**Implemented in Stage 2:** `content_items`, `media_assets` and `content_media`,
each with Row Level Security. See
[stage-2-content-library.md](./stage-2-content-library.md).

**Implemented in Stage 3:** `script_revisions` and `platform_variants`. Neither
carries a Scripture column — Scripture lives on `content_items` alone, so no
writing surface can alter a verse. See
[stage-3-writing-studios.md](./stage-3-writing-studios.md).

**Implemented in Stage 4:** `video_projects`, `video_scenes`,
`production_assets` and `render_jobs`. A Scripture scene stores a _reference_
rather than a copy of the verse, and `render_jobs` cannot record a completed
render without an output file. See
[stage-4-video-studio.md](./stage-4-video-studio.md).

**Implemented in Stage 5:** approval columns on `platform_variants`, plus
`scheduled_posts`, `recurring_schedule_rules` and an append-only `audit_log`.
Approval carries a deterministic fingerprint of what was approved, so an edit
to publication-sensitive content withdraws the approval and pauses anything
scheduled on it. See
[stage-5-approval-scheduling.md](./stage-5-approval-scheduling.md).

**Still planned:** every other model in
[database-plan.md](./database-plan.md).

#### Separation from Genesis

The project sits inside the Supabase **organisation** `Genesis O.S`, which is a
billing and management container. The application project, database, auth
tenant, credentials, migrations and RLS policies are entirely its own, and no
Genesis project is ever accessed. The full breakdown is in
[supabase-setup.md](./supabase-setup.md).

#### Client architecture

`@supabase/ssr` with the Next.js App Router:

| Module                       | Runs in | Purpose                              |
| ---------------------------- | ------- | ------------------------------------ |
| `src/lib/supabase/config.ts` | Both    | Validates URL and publishable key    |
| `src/lib/supabase/client.ts` | Browser | Client Component access              |
| `src/lib/supabase/server.ts` | Server  | Server Components, Actions, handlers |
| `src/lib/supabase/proxy.ts`  | Edge    | Session refresh and route protection |

Clients are constructed lazily inside functions, never at module scope, so
`next build` does not require runtime configuration.

Next.js 16 renamed the `middleware` file convention to `proxy`; session refresh
lives in `src/proxy.ts`.

Only the publishable key is used. The service role key bypasses RLS and appears
nowhere in the application — a test enforces this.

### Google Drive — large media

Large media — source video, rendered exports, audio — is planned to live in
Google Drive rather than in the primary database or object store. Media files
are far larger than the metadata describing them, and Drive is already part of
the existing production workflow.

The database stores references to Drive objects; Drive stores the bytes.

## Background worker _(planned)_

Rendering and publishing are planned to run in a **background worker**, not in
the request path. Both are long-running and failure-prone: a render can take
minutes, and a publish depends on a third-party API that may be slow, rate
limited, or down.

Stage 4 established why this is not negotiable for rendering specifically:
Remotion's bundler cannot run inside a Next.js route, a renderer needs a
headless browser and FFmpeg binaries that a function bundle does not carry, and
a render can outlast the platform's maximum function duration. The research and
the chosen architecture are in
[stage-4-video-studio.md](./stage-4-video-studio.md). The `RenderProvider`
interface exists; **no provider is connected**, and `getRenderProvider()`
returns `null` rather than a stub.

The worker is responsible for:

- Media rendering jobs
- Publishing to social platforms at scheduled times
- Retry and backoff on transient failure
- Recording every attempt (see `PublishAttempt` in
  [database-plan.md](./database-plan.md))

The worker is a separate execution context, not a separate service in the
microservice sense — it shares the same codebase and data model.

## Adapter interfaces _(planned)_

External systems sit behind adapter interfaces so the core domain does not
depend on any vendor's specifics:

| Adapter          | Purpose                             |
| ---------------- | ----------------------------------- |
| Social platforms | Publishing and metrics per platform |
| Storage          | Large media persistence             |
| AI               | Caption and copy assistance         |
| Notifications    | Alerting the owner to state changes |

Each adapter defines its own contract; platform quirks stay behind it. This also
keeps the domain testable without live credentials.

Details and current caveats are in [api-integrations.md](./api-integrations.md).

## Separation from other projects

This repository is independent of:

- **The Precious Promises Bible app** — no shared code, no shared database, no
  shared deployment.
- **Genesis O.S and Genesis Dominion** — no access, no shared infrastructure,
  no shared credentials.

Separation is deliberate. These systems have different lifecycles, different
risk profiles and different owners, and coupling them would make each one
harder to change safely.

## What exists today

| Piece                                       | State           |
| ------------------------------------------- | --------------- |
| Next.js App Router shell                    | Implemented     |
| TypeScript strict mode                      | Implemented     |
| Tailwind CSS styling                        | Implemented     |
| Typed environment validation                | Implemented     |
| `GET /api/health`                           | Implemented     |
| Unit, component and E2E test setup          | Implemented     |
| CI workflow                                 | Implemented     |
| Supabase project and SSR clients            | Implemented     |
| Email/password sign-in, sign-out            | Implemented     |
| Protected `/dashboard`, private `/login`    | Implemented     |
| `profiles` table with RLS                   | Implemented     |
| Premium dashboard shell and navigation      | Implemented     |
| Content, script and caption models with RLS | Implemented     |
| Video studio models with RLS                | Implemented     |
| Video editor and browser preview            | Implemented     |
| Approval workflow and fingerprinting        | Implemented     |
| Production Board, Calendar, scheduling      | Implemented     |
| Audit log                                   | Implemented     |
| Server rendering                            | **Not started** |
| Timed job execution                         | **Not started** |
| Google Drive, worker, adapters, publishing  | **Not started** |
