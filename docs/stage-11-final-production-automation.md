# Stage 11 — Final Production Automation

The completion stage. Stage 11 adds the pieces that turn the dashboard from a
publishing and measurement tool into a production system: real server-side
video rendering, private generated-media storage, ElevenLabs narration, safe
AI assistance, the Content Planner, the YouTube & Playlists workspace, the
Rights & Licences register, Settings, and an optional production pipeline that
links them.

**Nothing in Stage 11 publishes.** Every path through this stage ends at a
draft, a stored file, or a planning record. Publishing still runs exclusively
through the Stage 5 approval gate and the Stage 6 execution-time safety gate,
and AI can touch none of them.

---

## 1. Integration research record

Every external integration below was verified against official documentation
at implementation time. The direct vendor sites (`remotion.dev`,
`elevenlabs.io`) are blocked by this environment's egress proxy — the same
condition Stage 7 recorded for `developers.google.com` — so the official
documentation was read through the Context7 documentation index, which mirrors
the vendors' own docs pages, and each entry cites the underlying source URL.

### 1.1 Remotion server-side rendering

- **Researched:** 2026-08-15
- **Official sources:** `remotion.dev/docs/ssr-node`, `remotion.dev/docs/bundle`,
  `remotion.dev/docs/renderer`, `remotion.dev/docs/docker` (via Context7
  `/remotion-dev/remotion`).
- **Capability:** `bundle({ entryPoint })` from `@remotion/bundler` produces a
  serveable bundle; `selectComposition({ serveUrl, id, inputProps })` and
  `renderMedia({ codec: "h264", composition, serveUrl, outputLocation, inputProps })`
  from `@remotion/renderer` render it to MP4. Designed for Node
  environments, **never** inside an ordinary request handler.
- **Authentication:** none (local rendering). Remotion downloads a headless
  Chromium on first render unless one is provided.
- **Limits relevant here:** rendering is CPU-heavy and long-running — it must
  run in a background worker. On Linux, `chromiumOptions.enableMultiProcessOnLinux`
  is the documented performance setting.
- **Licensing:** Remotion is source-available, **not** free for every company.
  Individuals and small teams use the free licence; larger companies need a
  paid company licence (`remotion.pro`), and server-side rendering accepts a
  `licenseKey` option. This is recorded in the Rights & Licences register
  seed guidance, and the decision of which licence applies to Precious
  Promises is Dave's, not this code's.
- **Implementation decision:** a `RenderProvider` implementation
  (`src/lib/render/remotion-provider.ts`) that fulfils the Stage 4
  `getRenderProvider()` contract, invoked only from the render worker path.
  The Remotion entry point lives in `src/remotion/`, separate from the Next.js
  app tree so the two bundlers never collide.
- **Deliberately unsupported:** Remotion Lambda/Cloud Run distributed
  rendering (no such infrastructure is configured); rendering inside a
  Next.js request.

### 1.2 Trigger.dev background tasks

- **Researched:** 2026-08-15
- **Official source:** the `@trigger.dev/sdk` v4 patterns already established
  and validated in this repository (Stage 6 publishing tasks, Stage 10
  analytics tasks), plus `trigger.dev/docs` for task duration limits.
- **Capability:** `task({ id, maxDuration, run })` defines a long-running
  background task; `schedules.task({ cron, ... })` a scheduled one.
- **Status:** **IMPLEMENTED, NOT CONNECTED.** No Trigger.dev project is
  configured (`TRIGGER_PROJECT_REF` is unset), so nothing runs on a schedule
  and no task is deployed. Exactly as with Stage 10 analytics, every Stage 11
  worker path is also invocable directly from a Server Action so the product
  works without the scheduler; the interface says "Implemented, not running".
- **Implementation decision:** a render task (`src/trigger/render.ts`)
  wrapping the same orchestration the manual path uses. Rendering from the
  dashboard runs the orchestration directly (fire-and-forget from a Server
  Action); the Trigger.dev task exists for when a project is connected.

### 1.3 ElevenLabs text-to-speech

- **Researched:** 2026-08-15
- **Official sources:** `elevenlabs.io/docs/api-reference/text-to-speech/convert`,
  `api-reference/authentication`, `docs/overview/models` (via Context7
  `/websites/elevenlabs_io`).
- **Capability:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`
  with header `xi-api-key: <key>`, JSON body `{ text, model_id, voice_settings? }`
  and query `output_format` (default `mp3_44100_128`). Returns the audio
  bytes. Voices are listed via `GET /v1/voices`.
- **Authentication:** `xi-api-key` header; the key is server-only
  (`ELEVENLABS_API_KEY`), resolved through `src/lib/env/server.ts` and never
  sent to the browser.
- **Limits relevant here:** `eleven_multilingual_v2` accepts up to **10,000
  characters per request**; `eleven_v3` accepts 5,000. The provider enforces
  the limit for the configured model and refuses longer scripts with an
  honest error instead of silently truncating.
- **Implementation decision:** `src/lib/voice/` — config (hostname confined
  there per the workflow-safety guard), provider, repository. Default model
  `eleven_multilingual_v2` (the documented high-quality general model with
  the larger request limit). The voice ID is owner configuration
  (`app_settings`), not code.
- **Deliberately unsupported:** voice cloning and voice design endpoints are
  **not** integrated — the provider can only use a voice that already exists
  in Dave's ElevenLabs account. No streaming endpoint (files are stored, not
  streamed live).

### 1.4 AI provider — Anthropic Claude

- **Researched:** 2026-08-15
- **Official sources:** the Anthropic API documentation and the current
  `@anthropic-ai/sdk` TypeScript SDK reference (platform.claude.com/docs).
- **Why Anthropic, and why one vendor:** no prior provider decision existed
  in the repository, so one primary implementation was chosen deliberately
  rather than integrating several vendors. Anthropic's Messages API has
  first-class **structured outputs** (`output_config.format` with a JSON
  schema), which is the load-bearing feature for this product: the response
  is constrained to a schema whose fields keep generated text structurally
  separate from Scripture, so "the model returned replacement Scripture as
  trusted Scripture" is not a parseable outcome. The official TypeScript SDK
  is used (never raw fetch), per current Anthropic guidance.
- **Capability used:** single `messages.create` calls (no agent loop, no
  tools) with `model: "claude-opus-5"` (the current recommended default),
  a system prompt fixed server-side, and a JSON-schema-constrained output.
- **Authentication:** `ANTHROPIC_API_KEY`, server-only.
- **Limits relevant here:** generation requests here are small (≤ 4k output
  tokens), well inside non-streaming SDK guidance.
- **Deliberately unsupported:** AI never approves, schedules, publishes,
  verifies Scripture, or edits stored content. Everything it produces is a
  draft a human must accept, and acceptance runs through the existing
  revision / variant / approval-invalidation machinery.

### 1.5 Supabase Storage — private generated media

- **Researched:** 2026-08-15
- **Official sources:** `supabase.com/docs/guides/storage` (buckets, RLS on
  `storage.objects`, signed URLs) via Context7 `/supabase/supabase`.
- **Capability:** a private bucket is a row in `storage.buckets` with
  `public = false`. Access control is RLS on `storage.objects`. Server-side
  writes use the worker (service-role) credential, which bypasses RLS.
  `createSignedUrl(path, expiresIn)` issues a short-lived download URL and
  requires SELECT permission on the object row — for a private bucket with
  no browser policies, only trusted server code can mint one.
- **Implementation decision:** one private bucket, `generated-media`, created
  by migration. **No storage.objects policies for the browser at all** — the
  same worker-only pattern as the credential tables. Every read and write
  goes through server code; the browser receives only short-lived signed
  URLs minted by a Server Action that first proves ownership of the
  referenced asset row. Object keys are always
  `<owner_id>/<asset kind>/<uuid>.<ext>` — generated server-side, never taken
  from a request.
- **Deliberately unsupported:** public buckets, permanent public URLs,
  browser-side uploads to the bucket, arbitrary object-key access. Google
  Drive remains **read-only** (Stage 8 containment untouched).

### 1.6 YouTube playlists

- Already implemented and verified in Stage 7 (`playlists.list`,
  `playlistItems.insert`, quota costs recorded in `src/lib/youtube/config.ts`
  and `docs/stage-7-youtube.md`). Stage 11's YouTube workspace **reuses** the
  Stage 7 connection, credential and API modules; no second credential system
  and no new endpoints were added. The workspace reads: connected channel
  identity, readiness (publishing + analytics permission states), playlists
  available to the connected channel, and the uploads this dashboard has
  itself recorded. It claims no API visibility beyond that — in particular it
  does not claim to list uploads made outside this dashboard, and it never
  fabricates a Shorts classification (no API field exists for it).

---

## 2. What Stage 11 must never weaken

The full Stage 0–10 safety inventory is restated in `docs/security.md`. The
rules Stage 11 code touches most closely:

- **Scripture is immutable data.** No AI, render, voice or planner path
  writes to verified Scripture. AI receives Scripture as read-only context,
  and its output fields are structurally separate from Scripture.
- **Approval invalidation.** Accepting an AI caption/title draft edits the
  platform variant through the existing update path, which recomputes the
  fingerprint and invalidates approval exactly as a hand edit does.
- **The publishing gates.** Production automation ends at "ready for review".
  There is no code path from any Stage 11 module into `publish` execution.
- **Credentials are server-only.** ElevenLabs, Anthropic and the storage
  bucket join the existing pattern: keys resolved in `src/lib/env/server.ts`,
  status surfaced to the browser only as Configured / Not configured.
- **No fake success.** A render is `rendered` only after the output file
  verifiably exists in storage; a voice generation is complete only after the
  audio bytes are stored; a failed provider call is recorded as failed.

---

## 3. Generated-media storage

`src/lib/storage/` — the trusted server layer over the `generated-media`
bucket.

- `config.ts` — bucket name, allowed MIME types and size ceilings per asset
  kind (`rendered_video`, `voiceover`, `thumbnail`, `render_intermediate`),
  signed-URL TTL (10 minutes), object-key builder and sanitiser.
- `generated-media.ts` — `storeGeneratedMedia`, `createSignedDownloadUrl`,
  `deleteGeneratedMedia`, `generatedMediaExists`, all requiring the worker
  client. Uploads validate MIME type and size before a byte is written; keys
  are built from `(ownerId, kind, uuid, extension)` and never from input.
- `generated_media_assets` table — the metadata row for every stored object:
  owner, kind, bucket path, MIME, size, source (render job / voice job),
  linked content item. Browser: SELECT only. Writes: worker only, and only
  after the object genuinely exists.
- **Publishing consumption:** `src/lib/publishing/media-source.ts` gains a
  `generated` source alongside `google_drive`, resolved server-side through
  the same worker path publishing already uses. No public proxy exists.

Deletion rules: a generated asset row can be deleted by the owner only when
no scheduled post references its media asset; deletion removes the storage
object first, then the row, and is audited.

---

## 4. Rendering

`src/lib/render/` — completes the Stage 4 architecture.

- The Stage 4 `getRenderProvider()` now returns the Remotion provider when
  rendering is configured (`RENDER_ENABLED=true` and the runtime can load
  `@remotion/renderer`), and continues to state honest unavailability
  otherwise.
- **Lifecycle:** `draft composition → render requested (render_jobs row,
status queued) → rendering → rendered | failed | cancelled`, with
  `render_jobs` as the explicit state machine (`docs/state-machines.md`).
- The status becomes `rendered` **only after** the MP4 exists in the
  `generated-media` bucket and its `generated_media_assets` row is written.
  The job row records composition snapshot, input asset references, output
  storage reference, timestamps, failure category and detail.
- **Crash-safe reconciliation:** every job's output key is deterministic
  (`<owner>/rendered_video/render-<job id>.mp4`) and recorded on the job row
  at claim time. `reconcileRenderJob` re-checks storage for a job stuck in
  `rendering`: if the file exists, the job is completed from the found file
  rather than re-rendered; if not, the job is marked failed
  (`worker_crashed`) and can be retried explicitly. Duplicate renders of the
  same job are prevented by the deterministic key and the claim transition.
- Renders run in the worker path (`src/trigger/render.ts` or the direct
  server orchestration) — never in a page or ordinary Server Action request.

---

## 5. Voice generation

`src/lib/voice/` — ElevenLabs provider and lifecycle.

- Config: `ELEVENLABS_API_BASE = https://api.elevenlabs.io` (hostname
  confined to this module), model registry with per-model character limits,
  fixed output format `mp3_44100_128`.
- Provider: `generateSpeech({ text, voiceId, modelId })` → audio bytes or a
  classified failure (`not_configured`, `invalid_voice`, `rate_limited`,
  `quota_exceeded`, `provider_unavailable`, `transient`, `refused`,
  `unknown`). Retry only for `rate_limited`/`provider_unavailable`/`transient`.
- `voice_jobs` table records every generation: owner, content item, script
  revision reference, voice id, model, character count, status, failure
  category, output asset reference. The audio is stored privately as a
  `voiceover` generated asset and attached to the video project as an audio
  asset reference.
- **No cloning.** The provider exposes no cloning or voice-design calls; the
  voice ID must be one Dave configured (validated against `GET /v1/voices`
  at configuration time when connected).
- Status vocabulary: IMPLEMENTED now; CONNECTED only when
  `ELEVENLABS_API_KEY` is configured; LIVE-VERIFIED only after a real
  generation has succeeded (none has — the key does not exist yet).

---

## 6. AI assistance

`src/lib/ai/` — provider abstraction and Scripture-safe generation.

### The provider

- `AIProvider` interface: `generateDraft(request) → AIDraftResult`. One
  implementation: `AnthropicProvider` (official SDK, `claude-opus-5`).
  Vendor code is confined to `anthropic-provider.ts`.
- Requests are typed by `generation type`: `script_draft`, `script_shorten`,
  `commentary_expand`, `short_conversion`, `prayer`, `declaration`, `title`,
  `description`, `caption`, `hashtags`, `cta`, `plan_note`.

### Scripture safety, structurally

- The verified Scripture reference and exact verified text are injected as a
  **separate, read-only context block**, never mixed into the instruction
  text, and the system prompt states they must be treated as immutable input.
- The response is constrained by JSON schema to typed fields —
  `generated_script`, `declaration`, `prayer`, `commentary`, `caption`,
  `title`, … — **none of which is Scripture**. There is no `scripture` output
  field, so the model cannot return replacement Scripture in a trusted slot.
- Anything Scripture-shaped inside a generated field remains generated,
  unverified text. It renders as generated content and can only become
  verified Scripture through the existing Scripture verification system.
- Guard functions refuse to store a generation whose type or fields are
  outside the schema, and the generation record never marks anything
  verified/approved.

### Provenance

`ai_generations` table: owner, content item, generation type, provider,
model, prompt template version, status (`drafted`/`accepted`/`rejected`),
created/accepted timestamps, and the accepted target (which revision or
variant the acceptance created). No secrets, no raw provider payloads, no
hidden reasoning. Human-written and AI-assisted work stay distinguishable
without implying AI content is approved.

### Studio integration

- **Script Studio:** explicit "Draft with AI" actions; a generation becomes a
  **new script revision candidate** through the existing revision mechanism —
  never a silent overwrite. Dave accepts or rejects.
- **Caption Studio:** platform-limit-aware drafts (limits read from the
  existing per-platform config modules — the same verified values publishing
  enforces). Accepting a draft updates the variant through the existing
  update path, so an approved variant's fingerprint changes and approval is
  invalidated exactly as for a manual edit.

---

## 7. Content Planner (`/dashboard/planner`)

`planner_items` — owner-scoped planning records: topic, content type, target
platforms, target period/date, priority, status
(`idea → planned → in_production → done | dropped`), notes, optional linked
content item, optional series label.

- Views: backlog, this week, upcoming, by topic, by platform.
- **A planner item is not a scheduled post.** Nothing in the planner writes
  to scheduling tables; "in production" links to a content item at most.
- **Analytics-informed suggestions** reuse Stage 10's evidence machinery
  (`findTopicGapCandidates`, winners, confidence). Every recommendation
  carries reason + source evidence + confidence, and when Stage 10 says
  insufficient evidence the planner shows the absence rather than inventing
  a data-driven claim. AI may rephrase an evidence-backed plan note on
  request; it cannot invent the evidence (the recommendation builder is pure
  and AI-free).

---

## 8. YouTube & Playlists (`/dashboard/youtube`)

Read-only workspace over the Stage 7 connection: channel identity, publishing
readiness, analytics permission state, playlists available to the connected
channel (fetched live when connected; honest empty state otherwise), the
uploads this dashboard recorded (with processing/privacy/thumbnail state from
the existing `youtube_uploads` tracking), playlist selection per variant
(the existing Stage 7 mechanism), and links back to the owning content item.
Claims nothing the API does not provide; Shorts classification remains
YouTube's decision and is shown as such.

---

## 9. Rights & Licences (`/dashboard/rights`)

`licence_records` — an administrative register, not legal advice: asset
label, optional linked media asset, rights source, licence type, licensor,
permitted use, proof reference, start/expiry dates, status
(`active | expiring | expired | needs_review | restricted`), notes.

- Warnings: missing licence info on assets in use, expiring within 30 days,
  restricted-use assets.
- Publishing is **not** blocked by an empty optional field — no such product
  rule was established, and inventing one would freeze the pipeline on
  paperwork. The register warns; Dave decides.
- The seed guidance lists the rights questions this product already knows
  about: Scripture translation usage notes, music/ambience, background
  media, fonts, ElevenLabs voice usage terms, and the Remotion company
  licence.

---

## 10. Settings (`/dashboard/settings`)

`app_settings` — one row per owner: timezone, default video dimensions/type,
default CTA text, brand text, ElevenLabs voice id + model, planner defaults.
Owner-scoped RLS; the form writes through a Server Action.

Alongside owner preferences, the page shows operational readiness, each as
Configured / Not configured (never a secret value, never credential
contents): AI provider, ElevenLabs, rendering, Trigger.dev, worker
credential, per-platform connections (linking to Connected Accounts rather
than duplicating it), and analytics sync state.

---

## 11. Production automation

`src/lib/production/pipeline.ts` + `production_jobs` — a **workflow
assistant**, not an autonomous machine.

- Lifecycle: `pending → planning → generating_text → generating_voice →
rendering → ready_for_review | failed | cancelled` (recorded in
  `docs/state-machines.md`). Production state is a separate table and
  vocabulary from publish state; nothing is overloaded.
- Each step is explicit and human-triggered; the pipeline records progress
  and links artefacts (AI generation → script revision, voice job → audio
  asset, render job → video asset).
- **The pipeline ends at `ready_for_review`.** Approval, scheduling and
  publishing remain exactly the Stage 5/6 paths, human-driven. No workflow
  step may leap from generation to publishing; the pipeline has no imports
  from the publishing worker and writes to no publishing table.
- Failure at any step blocks later steps; retry classification follows the
  established transient-only rule; cancellation stops future steps, keeps
  audit history, deletes nothing approved, publishes nothing.

---

## 12. Audit

New actions (no secrets, no payloads, no metric values, no hidden
reasoning): `ai_generation_requested/completed/failed`,
`ai_generation_accepted/rejected`, `voice_generation_requested/completed/failed`,
`render_requested/started/completed/failed`, `production_job_created/advanced/cancelled/failed`,
`planner_item_created/updated/deleted`, `licence_record_created/updated/deleted`,
`settings_updated`, `generated_media_deleted`.

---

## 13. Status vocabulary

| Term                        | Meaning here                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------- |
| IMPLEMENTED                 | The code exists, is typed, tested against fakes, and honest about being unconnected |
| CONFIGURED / NOT CONFIGURED | Whether the server credential/setting exists (shown without values)                 |
| CONNECTED                   | A real credential exists and the provider accepted it                               |
| LIVE-VERIFIED               | A real end-to-end operation has succeeded against the live service                  |
| RUNNING / FAILED            | Live job states in a lifecycle                                                      |
| BLOCKED / DEFERRED          | Explicitly not possible / explicitly postponed, with the reason stated              |

At Stage 11 completion: rendering, voice, AI, planner, YouTube workspace,
rights, settings and production pipeline are **IMPLEMENTED**. Nothing new is
CONNECTED (no ElevenLabs key, no Anthropic key, no Trigger.dev project, no
social account) and nothing is LIVE-VERIFIED. Zero live provider calls were
made during this stage: no render has run against a real project deploy, no
ElevenLabs call, no Anthropic call, no social post.

## 14. Validation

`format:check`, `lint`, `typecheck`, `test`, `test:coverage`, `build`,
`test:e2e` — all green; Supabase security advisor re-run after the Stage 11
migration. CI remains green with every provider credential unset:
disconnected integrations render truthful unavailable states, and the build
performs no live provider access.
