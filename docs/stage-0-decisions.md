# Stage 0 decisions

A record of the choices made during Stage 0, and the reasoning behind them, so a
later reader can tell what was deliberate and reopen a decision on its merits
rather than by accident.

These are decisions about direction. Except where noted, they describe work that
has **not** been built.

---

## Why a modular monolith

**Decision.** One deployable Next.js application, internally divided into
modules with explicit boundaries. No microservices during the MVP.

**Reasoning.** Microservices buy independent scaling and independent deployment,
and they cost deployment surface, network failure modes, distributed tracing,
data consistency across boundaries, and a much harder local development story.

For a single owner running a single workload, the costs land immediately and the
benefits are entirely hypothetical. Nothing in this product is under load that a
single application cannot serve.

Module boundaries are still enforced inside the monolith, so if a component ever
does need to be extracted, the seam already exists. That is the cheap half of
the microservice benefit without the expensive half.

**Reopen if.** A component develops genuinely different scaling or availability
characteristics — the rendering worker under sustained load is the plausible
candidate.

---

## Why Supabase is separate from Genesis O.S

**Decision.** This product uses its own Supabase project. It shares no database,
no auth tenant and no credentials with Genesis O.S or Genesis Dominion.

**Reasoning.** These are different products with different owners, lifecycles and
risk profiles. Sharing a data plane would mean a schema migration in one system
can break another, a credential compromise in one exposes the others, and access
control has to reason about which product a row belongs to.

The dashboard also handles third-party publishing credentials, which is a
distinctly sensitive class of data. Keeping that blast radius small is worth far
more than the modest convenience of a shared project.

**Reopen if.** Never, on current information. Separation is the point.

---

## Why Google Drive is planned for large media

**Decision.** Large media — source video, rendered exports, audio — lives in
Google Drive. The database stores references.

**Reasoning.** Media is orders of magnitude larger than the metadata describing
it, and storing large binaries alongside relational data makes backup, restore
and migration slow and expensive.

Drive is also already part of the existing production workflow, which means files
stay reachable through tools already in use rather than being locked inside the
dashboard.

**Reopen if.** Drive's API constraints prove limiting for programmatic rendering
and publishing, at which point dedicated object storage is the alternative. The
storage adapter exists so this can change without disturbing the domain.

---

## Why social integrations are deferred

**Decision.** No social platform integration during Stage 0. `.env.example`
carries placeholders; the environment schema keeps every one optional.

**Reasoning.** Social platform integrations are the least stable and most
research-dependent part of this product. Their APIs change, their app-review
processes gate access, and their requirements cannot be reliably worked out
without reading current documentation at implementation time.

Building them before the foundation — testing, CI, environment validation,
approval workflow — would mean building the riskiest components on unverified
ground, and rewriting them once the foundation settled.

Deferring also keeps Stage 0 honest: no credentials are needed, so tests and CI
run without secrets.

**Reopen if.** Never as a matter of order — the foundation comes first. Each
integration proceeds in its own block, after its documentation is reverified.

---

## Why human approval is mandatory

**Decision.** No content reaches an external platform without explicit human
approval, and editing approved content invalidates that approval.

**Reasoning.** This product publishes Scripture and ministry content under a
real person's name to a real audience. The cost of a wrong publish is not a bug
report — it is a public misstatement, potentially of Scripture, that cannot be
recalled once seen.

Automated publishing would optimise for a convenience that was never the
constraint. The bottleneck in this workflow is production, not the final click.

Approval attaches to a specific version because approval of something that has
since changed is not approval at all. See
[state-machines.md](./state-machines.md).

**Reopen if.** Never. This is a product requirement, not a technical one.

---

## Why CI does not initially run Playwright

**Decision.** The main CI workflow runs formatting, linting, typecheck, unit
tests and build. The Playwright suite is excluded during Block 2.

**Reasoning.** End-to-end runs need a browser download, a production build and a
running server — substantially more time and cache management than the checks
above, on every pull request.

The value at this stage is also low: there is exactly one smoke test against a
placeholder homepage, and the component test already covers that heading. The
cost would be paid on every push for a check that is nearly redundant today.

The suite is maintained and runnable locally with `pnpm test:e2e`, so it does not
rot while it waits.

**Reopen if.** As soon as there is real interface to protect. A dedicated
end-to-end workflow — with its own browser cache and a narrower trigger — is
planned for a later block. This is a deferral, not a rejection.

---

## Why the product starts as a single-owner founder edition

**Decision.** Build for one owner: Dave, Founder & Creator. No organisations, no
team roles, no invitations, no billing.

**Reasoning.** There is one user, and that user's workflow is fully known. Every
multi-tenant construct added now — org boundaries, role checks, seat management
— would be speculative structure carrying real cost in complexity and in every
query, built against requirements nobody has stated.

The data model still names a `User` explicitly rather than assuming a global
singleton, which is the cheap insurance: ownership is modelled from the start, so
adding tenancy later is an extension rather than a rewrite.

**Reopen if.** A second genuine user appears.

---

## Commercial multi-tenant SaaS remains a later possibility

**Not a decision — a possibility deliberately left open.**

Nothing in Stage 0 forecloses turning this into a multi-tenant product later.
Ownership is modelled explicitly, Row Level Security is the planned enforcement
layer, and platform credentials are already per-account rather than global.

Equally, nothing here commits to it. No multi-tenant machinery is built, and none
should be built on speculation. This is recorded so a future reader knows the
door was left open on purpose — not so anyone treats it as a roadmap item.
