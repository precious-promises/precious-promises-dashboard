# Architecture

> **Status: planned.** This document records the approved architectural
> direction. Apart from the Next.js application shell, none of what follows is
> implemented. Sections describing future work are marked _(planned)_.

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
- Mutations will use Server Actions or route handlers _(planned)_.

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

## Data and storage _(planned)_

### Supabase — Auth, Postgres and metadata

Supabase is the planned provider for authentication, the Postgres database, and
all structured metadata: content items, schedules, publish attempts, approval
actions and audit records.

This is a **separate Supabase project** from anything belonging to Genesis O.S.
See [stage-0-decisions.md](./stage-0-decisions.md).

Row Level Security is planned as the enforcement layer for data access; see
[security.md](./security.md).

The planned models are catalogued in [database-plan.md](./database-plan.md).
None exist yet.

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

| Piece                              | State           |
| ---------------------------------- | --------------- |
| Next.js App Router shell           | Implemented     |
| TypeScript strict mode             | Implemented     |
| Tailwind CSS styling               | Implemented     |
| Typed environment validation       | Implemented     |
| `GET /api/health`                  | Implemented     |
| Unit, component and E2E test setup | Implemented     |
| CI workflow                        | Implemented     |
| Everything else on this page       | **Not started** |
