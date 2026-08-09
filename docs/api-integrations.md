# API integrations

> **Status: planned. No integration is implemented.**
>
> No adapter, client, credential or API call exists in this repository. The
> dashboard cannot currently authenticate with, read from, or publish to any
> external platform.

## Verify the documentation before you build

**Current official documentation must be reverified immediately before each
integration is implemented.**

This is not boilerplate caution. Social platform APIs change their endpoints,
scope names, media constraints, review requirements and rate limits on their own
schedule, and they deprecate versions on fixed timetables. Anything written here
or remembered from previous work is a starting point for research, not a
specification.

Accordingly, this document deliberately **does not state** permissions, scope
names, quotas, rate limits, media specifications, or app-review status for any
platform. Inventing those values produces code that fails in ways that are hard
to diagnose — and, worse, code that looks authoritative while being wrong.

When implementing an adapter:

1. Read the platform's current official documentation.
2. Confirm the API version and its deprecation date.
3. Confirm the exact scopes required — request the narrowest set that works.
4. Confirm media constraints, rate limits and any app-review requirement.
5. Record what was verified, and when, in the implementing pull request.

## Adapter pattern

Every external system sits behind an adapter interface, so the core domain never
depends on a vendor's specifics. Adapters are the only place platform quirks
live, and they are what makes the domain testable without live credentials.

Adapters must never fabricate success. If a call did not genuinely succeed, the
adapter reports failure — see [security.md](./security.md).

### The publishing contract — _implemented in Stage 6_

`PublishingProvider` in `src/lib/publishing/providers.ts` is the interface every
platform integration will implement: `isConnected`, `validateReadiness`,
`preparePayload`, `publish`, an optional `reconcile`, and `classifyError`.

`reconcile` is optional because not every platform lets you look up a post you
may have created; requiring it of all of them would mean writing a fake one
somewhere.

A `PublishResult` has three shapes, not two — `succeeded` (which **requires**
the platform's own post id), `failed`, and `incomplete` for platforms that can
only be driven as far as a draft or that need the owner to finish by hand.
Forcing that third case into "succeeded" would claim something went live that
did not.

**`getPublishingProvider` returns `null` for every platform.** No stub exists,
deliberately: a stub returning a plausible post id would be indistinguishable
from a working integration at the call site. See
[stage-6-publishing-infrastructure.md](./stage-6-publishing-infrastructure.md).

## Planned adapters

### YouTube _(planned)_

Video publishing and metrics retrieval for the channel.

Scopes, quota model, upload mechanics and metadata constraints: **to be verified
at implementation time.**

### Instagram _(planned)_

Publishing and metrics for Instagram, via Meta's platform APIs.

Account type requirements, the publishing flow, media constraints and app-review
requirements: **to be verified at implementation time.**

### TikTok _(planned)_

Publishing and metrics for TikTok.

Developer program requirements, the publishing flow, media constraints and
approval status: **to be verified at implementation time.**

### Google Drive _(planned)_

Large media storage — the bytes for source video, rendered exports and audio.
The database stores references; Drive stores the files. See
[architecture.md](./architecture.md).

Scopes, folder permission model and upload mechanics: **to be verified at
implementation time.**

### ElevenLabs _(planned)_

Voice synthesis for narration.

Voice selection, model options, output formats and usage limits: **to be
verified at implementation time.**

### AI caption provider _(planned)_

Caption and copy assistance, behind a provider-neutral interface configured by
`AI_PROVIDER`, `AI_MODEL` and `AI_API_KEY`.

The provider is deliberately abstracted so it can be changed without touching
the domain. AI output is **draft material for human review** — it never bypasses
the approval flow, and it is never used to generate or reconstruct Scripture.

### Rendering worker _(planned)_

The background renderer described in [architecture.md](./architecture.md),
following the rendering lifecycle in [state-machines.md](./state-machines.md).

Not an external vendor API, but treated as an adapter so rendering can be moved
or replaced without disturbing the domain.

### Notifications _(planned)_

Alerting the owner to state changes that need attention: content awaiting
approval, publish failures, token expiry, render failures.

Channel and provider: **to be decided.**

## Credentials

Every integration variable is present in `.env.example` with a placeholder and no
value, and every one is **optional** in the environment schema during Stage 0 —
none of these integrations exist, so requiring their credentials would break
local development, tests and CI for no benefit.

A variable becomes required in the block that implements the integration
depending on it.

Tests and CI never require real credentials.
