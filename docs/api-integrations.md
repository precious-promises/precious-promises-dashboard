# API integrations

> **Status: three integrations implemented — Google Drive, YouTube, Instagram.**
>
> Stage 7 built a genuine Google OAuth 2.0 connection and a YouTube Data API v3
> publishing provider. Every request it makes is a real request to Google.
>
> **It has not published anything, and cannot yet:** the upload path refuses
> with `media_source_unavailable`, because media is stored as metadata and no
> storage integration retrieves the file. See
> [stage-7-youtube.md](./stage-7-youtube.md).
>
> Stage 8 added Google Drive media retrieval (read-only, confined to an
> approved folder) and an Instagram Reels provider. Instagram images, carousels
> and Stories are **blocked by design** — Meta fetches those from a publicly
> reachable URL, and this application will not expose media to the open
> internet.
>
> Stage 9 added a TikTok provider with three delivery modes — direct post,
> upload to the creator's drafts, and manual posting. Only the first can ever
> report success, and only with TikTok's own post id. TikTok media is streamed
> as `FILE_UPLOAD`; `PULL_FROM_URL` is refused for the same reason Instagram
> images are. See [stage-9-tiktok.md](./stage-9-tiktok.md).
>
> Stage 10 added analytics readers for YouTube and Instagram — separate adapters
> from the publishing providers, so an analytics failure can never touch a
> publish record. **TikTok analytics were refused**, not deferred: the
> engagement counts are only in TikTok's Research API, which is restricted to
> qualifying academic institutions. See
> [stage-10-analytics-growth.md](./stage-10-analytics-growth.md).
>
> ElevenLabs and the AI caption provider remain unimplemented.

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

**`getPublishingProvider` still returns `null` for a platform with no adapter**,
and callers must handle that — which is what made adding each provider a change
to one line in the registry rather than a change everywhere. As of Stage 9 all
three platforms have one. The absence was never a placeholder waiting for a
stub: a stub returning a plausible post id would be indistinguishable from a
working integration at the call site. See
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

### Instagram — _implemented in Stage 8 (Reels only)_

Instagram API with Instagram Login. `src/lib/instagram/` holds the integration.

- **Reels are published** by creating a resumable container and uploading the
  bytes directly to `rupload.facebook.com`. No public URL is involved.
- **Images, carousels and Stories are refused.** They are documented only with
  publicly accessible URLs, and there is no binary upload path for them.
- **Tokens:** no refresh token exists. A short-lived token is exchanged for a
  60-day long-lived token that refreshes itself. An unused connection dies.
- **App Review** is required for `instagram_business_content_publish`.
- A container is not a post. Only the media id from `media_publish` can produce
  `posted`.

### TikTok — _implemented in Stage 9_

TikTok Login Kit with the Content Posting API. `src/lib/tiktok/` holds the
integration.

- **Three delivery modes**, and only one of them publishes. `direct_post`
  creates a real post; `inbox` puts the video in the creator's TikTok drafts;
  `manual` sends nothing at all. The same `PUBLISH_COMPLETE` status means a live
  post for the first and a finished **draft** for the second.
- **The audience comes from TikTok**, per creator, read live. An API client
  TikTok has not audited is restricted to `SELF_ONLY`, and for such a client
  TikTok does not return the public options at all — so this application never
  offers one it has not been told is available, and `privacy_level` has no
  default anywhere.
- **Media is streamed as `FILE_UPLOAD`.** `PULL_FROM_URL` would require domain
  verification and a publicly reachable video, which is refused. Chunk sizes
  follow TikTok's documented rules, including `total_chunk_count` rounding
  **down** so the final chunk carries the remainder.
- **Tokens:** access tokens last 24 hours and refresh tokens 365 days of
  inactivity, rotated on every exchange. Refreshing on nearly every publish is
  normal, not exceptional.
- **A session row is written before any byte is sent**, so a crashed worker
  reconciles rather than posting twice. An `init` is never called twice for the
  same approved operation.
- An unrecognised status maps to "still processing", never to success.

### Google Drive — _implemented in Stage 8_

Read-only retrieval from an approved folder, via Drive API v3.

- **Scope:** `drive.readonly` — the narrowest scope that can both list a folder
  and download its contents. `drive.metadata.readonly` cannot download;
  `drive.file` cannot see pre-existing files.
- **The folder boundary is application-enforced**, because Google has no
  folder-scoped read scope. Every read proves containment first, and fails
  closed.
- Nothing writes, deletes, or changes sharing.

### Analytics readers — _implemented in Stage 10_

Deliberately **separate adapters from the publishing providers**. They answer
different questions and fail for different reasons, and an analytics failure
must never be able to touch a publish record. Nothing in
`src/lib/analytics/` imports `@/lib/publishing`.

- **YouTube Analytics API** — views, watch time, average view duration, likes,
  comments, shares, subscribers gained. Needs
  `https://www.googleapis.com/auth/yt-analytics.readonly`, which the Stage 7
  publishing scopes do **not** include, so Connected Accounts offers an explicit
  re-consent rather than widening the existing request. `saves` and `reach` are
  absent because YouTube has no equivalent.
- **Instagram Insights** — views (which replaced `impressions` for media created
  after 2 July 2024), reach, likes, comments, shares, saves. No additional scope:
  the Stage 8 Business Login connection already covers reading insights back.
  **No watch time** — Meta exposes none through this API, so none is shown.
- **TikTok — refused.** The Display API returns metadata only; the engagement
  counts live in TikTok's Research API, restricted to qualifying academic
  institutions and non-profits with an approved research proposal and ethical
  review. Precious Promises would not qualify, so no connector was built. The
  interface states the reason. Figures can be entered by hand and are labelled
  as manual.

A metric absent from the capability matrix in `src/lib/analytics/providers.ts`
renders as "not reported by this platform", never as zero. See
[stage-10-analytics-growth.md](./stage-10-analytics-growth.md).

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
