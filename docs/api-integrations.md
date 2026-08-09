# API integrations

> **Status: one integration implemented — YouTube.**
>
> Stage 7 built a genuine Google OAuth 2.0 connection and a YouTube Data API v3
> publishing provider. Every request it makes is a real request to Google.
>
> **It has not published anything, and cannot yet:** the upload path refuses
> with `media_source_unavailable`, because media is stored as metadata and no
> storage integration retrieves the file. See
> [stage-7-youtube.md](./stage-7-youtube.md).
>
> Instagram, TikTok, Google Drive, ElevenLabs and the AI caption provider remain
> unimplemented. No adapter, client, credential or API call exists for any of
> them.

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

**`getPublishingProvider` returns `null` for Instagram and TikTok.** No stub
exists, deliberately: a stub returning a plausible post id would be
indistinguishable from a working integration at the call site. See
[stage-6-publishing-infrastructure.md](./stage-6-publishing-infrastructure.md).

`PROVIDER_STATUS` distinguishes `implemented` — a fact about this repository —
from whether a publish would actually succeed, which depends on a connected
account and on media that can be fetched. Conflating the two is how an interface
starts lying.

## Planned adapters

### YouTube — _implemented in Stage 7_

Google OAuth 2.0 web-server flow and the YouTube Data API v3.
`src/lib/youtube/` holds the whole integration, and it is the only directory in
`src/` permitted to name a platform host — a source-wide test enforces that.

Verified at implementation time, with provenance recorded in
[stage-7-youtube.md](./stage-7-youtube.md):

- **Scopes:** `youtube.upload`, `youtube.readonly`, `youtube` — the narrowest
  set that can upload, identify the channel, and file a video in a playlist.
  `youtubepartner` and `force-ssl` are deliberately not requested.
- **Quota:** an upload costs 1,600 units of a default 10,000 a day — six uploads.
- **Privacy:** an API client that has not passed Google's compliance audit has
  its uploads forced to private, so only `private` and `unlisted` are offered.
- **Field limits:** title 100 characters, description 5,000 **bytes**, tags 500
  characters combined, thumbnail 2 MB as JPEG or PNG.
- **Shorts:** no API field requests the classification. YouTube decides from the
  uploaded file, so this application does not claim to create one.
- **Uploads are resumable**, and the session is recorded before any bytes are
  sent, so an interrupted upload can be reconciled rather than repeated.

What is _not_ asserted: the Shorts duration threshold, which is a product rule
that has changed more than once. It is shown as guidance, not enforced.

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
