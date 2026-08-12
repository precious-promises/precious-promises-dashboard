# Security

> **Status: partly implemented.** Secret handling, authentication and Row Level
> Security across every table are enforced in code today. OAuth, request
> limits, auditing and publishing safety record the approved requirements for
> the blocks that will implement them. Each section is marked accordingly.

## Secret handling — _implemented_

- Server secrets are read only through `src/lib/env/server.ts`. That module must
  never be imported by a Client Component.
- `src/lib/env/public.ts` exposes `NEXT_PUBLIC_*` values only, and never
  re-exports anything from the server module.
- There is no barrel module combining the two, so a careless import cannot pull
  secrets into the browser bundle.
- `.env.example` contains placeholder keys with **no values**. Real values live
  in untracked `.env` files locally and in the deployment platform's secret
  store in production.
- `.gitignore` ignores every `.env*` file, with a single explicit exception for
  `.env.example`.

## No secrets in logs or errors — _implemented for env validation_

Environment validation errors name the offending **variable** and describe what
is wrong with it. They never include the received value.

This matters because validation errors surface in server logs, crash reporters
and CI output — places where a leaked secret persists long after the incident
is resolved. `tests/unit/env.test.ts` asserts this behaviour directly.

The same rule applies to platform errors — _implemented in Stage 6 and
extended in Stage 7_. `sanitiseErrorMessage` redacts bearer tokens, Supabase and
Trigger keys, JWTs and named credentials **before** truncating, so a secret
cannot survive by sitting past the cut. Google's `error.message` goes through
the same pass before anything is stored, and `sanitiseMetadata` drops any audit
key that looks like a credential.

No token, refresh token, session URI or client secret appears in any log line,
error message, audit record or telemetry event.

## OAuth — _implemented for Google/YouTube in Stage 7_

Every rule below is enforced in code for the YouTube connection, and remains
the standard any future platform must meet.

- **State validation.** The authorisation request carries 32 random bytes,
  base64url, stored against the owner with a ten-minute expiry and a uniqueness
  constraint. It is **consumed before the authorisation code is exchanged**, by
  a conditional update (`consumed_at is null`) so the database decides which of
  two racing callbacks wins. A missing, expired or already-used state is
  refused with a single message — distinguishing "never existed" from "already
  used" would tell an attacker which of the two they achieved.
- **The state table has RLS enabled and no policies at all**, so it cannot be
  read from a browser. A readable state token is a guessable one.
- **Redirect URIs** are registered per platform and validated as http(s) URLs by
  the environment schema. `/api/oauth` requires a session as well.
- **Server-only tokens.** `SocialAccount` — the type a page renders — has no
  field that could hold a token, and `social_account_credentials` has RLS
  enabled with **no policies**, so a session-backed client is refused by the
  database itself. Only trusted server code holding `SUPABASE_SECRET_KEY` can
  read it.
- **Token encryption.** AES-256-GCM via `node:crypto`, keyed by
  `TOKEN_ENCRYPTION_KEY`, in a versioned envelope (`v1.<iv>.<tag>.<ciphertext>`)
  with a fresh random IV per encryption. **No cryptography is written by hand**;
  a test asserts the module uses an authenticated cipher and contains no
  bit-twiddling of its own. Decryption failures all return the same message.
- **Resumable upload session URIs are treated as credentials.** Google's session
  URI is a bearer capability — anyone holding it can push bytes into that
  upload — so it is encrypted at rest, kept off every type that crosses a
  boundary, and its table also has RLS enabled with no policies.
- **Least privilege.** Three scopes: `youtube.upload`, `youtube.readonly` and
  `youtube`. `youtubepartner` and `force-ssl` are not requested — an unused
  broad scope is a standing risk with no benefit. If Google grants fewer scopes
  than asked, the connection is refused rather than recorded as working.
- **Identity is verified before a connection is recorded.** A token proves
  somebody authorised something; the channel lookup proves _what_. A connected
  YouTube row without a channel id is refused by check constraint, and
  `social_accounts` has **no INSERT policy** at all, so a browser cannot record
  a connection nobody made.
- **Revocation and disconnect.** Disconnecting revokes at Google **first**, then
  deletes the stored credential — the other order would leave a live grant
  nothing in this interface could see or withdraw. The local delete happens
  either way, and a revocation Google did not confirm is reported as such rather
  than presented as a clean disconnect.
- **Nothing from the provider is echoed back.** OAuth failures redirect with a
  short reason code from this application's own vocabulary; Google's
  `error_description` can quote request parameters, and a callback URL ends up
  in browser history and referrer headers.

## Media retrieval — _implemented in Stage 8_

- **Google Drive is read-only.** The scope requested is `drive.readonly`, and
  no code path writes, deletes or changes sharing on a file.
- **No media is ever made public.** There is no function that creates a Drive
  permission or an anyone-with-link share, and a source-wide test fails if one
  appears. Exposing media publicly to satisfy a platform's fetch model was
  considered and refused — see
  [stage-8-media-instagram.md](./stage-8-media-instagram.md).
- **The folder boundary is enforced in application logic, not by Google.**
  Google offers no folder-scoped read scope, so `drive.readonly` grants more
  than this application uses. Every listing and every read proves the target
  descends from `GOOGLE_DRIVE_ROOT_FOLDER_ID` first, walking parents
  breadth-first and **failing closed** on anything it cannot prove. A
  compromised server could read beyond the root; that limitation is stated
  rather than hidden.
- **Containment is re-proved at publish time**, not trusted from import — a
  file can be moved in Drive after it was imported.
- **No arbitrary URL fetching.** The `external` storage provider is refused
  rather than followed. Fetching whatever a record contained would make this
  application an SSRF primitive.
- **Filenames are sanitised before reaching a header.** Drive names are
  user-supplied and can contain newlines, which in an HTTP header is injection.

## Authentication — _implemented_

- **Email and password only**, through Supabase Auth. There is no public
  registration route; the owner's account is created manually in Supabase.
- **Sessions live in cookies handled server-side** by `@supabase/ssr`. The
  proxy (`src/proxy.ts`) refreshes them on every matched request.
- **Cache-control headers are propagated.** When Supabase sets auth cookies it
  supplies `no-store` headers alongside them, and the proxy applies them. Without
  that, a CDN could cache a response carrying one user's session cookie and
  serve it to somebody else.
- **Protected pages check the session themselves**, not only in the proxy.
  `/dashboard` calls `auth.getUser()` and redirects if there is no user. Proxy
  matchers are easy to misconfigure; a page rendering private content should not
  depend on one for its access control.
- **Sign-in failures are indistinguishable.** An unknown address and a wrong
  password return exactly the same message, so the form cannot be used to
  discover which addresses have accounts. Upstream error text is never shown —
  it can carry request ids and hostnames.
- **No password policy at sign-in.** Rejecting a short password client-side
  would reveal it could not be the stored one.

## Access control

- **Four tables are unreachable from the browser by construction** —
  _Stages 7 and 8_. `social_account_credentials`, `oauth_states`,
  `youtube_upload_sessions` and `instagram_publish_containers` have RLS
  **enabled with no policies whatsoever**,
  plus `revoke all … from authenticated`. With RLS on and no policy, every
  operation is refused for every row. This is the strongest available statement
  of "the browser cannot have this", and the Supabase advisor's
  `rls_enabled_no_policy` INFO notice on each is the intended shape, not a gap.
- **Row Level Security** — _implemented for every table_. All tables
  have RLS enabled, with one explicit policy per operation, for `authenticated`
  only, restricted to the caller's own rows. No catch-all policy; no `anon`
  policy, and the `anon` grant is revoked on each. Supabase's security advisor
  reports no lints. Details in [supabase-setup.md](./supabase-setup.md),
  [stage-2-content-library.md](./stage-2-content-library.md) and
  [stage-4-video-studio.md](./stage-4-video-studio.md).
- **Every child table proves parent ownership on write**, not just row
  ownership — script revisions and platform variants against `content_items`;
  video scenes, production assets and render jobs against `video_projects`.
  Otherwise a user could attach a scene, a caption or a render to somebody
  else's work.
- **Production asset slots additionally require ownership of the media
  asset**, so a user cannot attach somebody else's file to their own project
  and read its metadata back through the join.
- **Scheduled posts prove ownership of the platform variant on write**, so a
  schedule cannot be attached to somebody else's approved wording.
- **The audit log is append-only by policy** — a SELECT policy and an INSERT
  policy exist, and there is deliberately no UPDATE or DELETE policy, so with
  RLS enabled a recorded action cannot be rewritten or removed.
- **`content_media` inherits ownership** through its parent content item, and
  writes additionally require ownership of the media asset — so a user cannot
  attach somebody else's asset to their own content and read its metadata
  through the join.
- **`owner_id` is never accepted from a submission.** It is read from the
  authenticated session in the server action; the Zod schemas do not define the
  field, so a smuggled value is stripped before reaching the database. Tests
  assert this on the create payload, the update payload and the FormData reader.
- **Another owner's record 404s** rather than returning a distinguishable
  error, so responses cannot be used to discover which ids exist.
- **Writing surfaces cannot reach Scripture.** `script_revisions` and
  `platform_variants` have no Scripture column and their schemas define no such
  field, so the Script and Caption Studios structurally cannot alter a verse.
  `video_scenes` goes further: a Scripture scene is forbidden by check
  constraint from holding text at all, so the video editor references the
  verified verse rather than carrying a copy of it.
- **No service role key.** The application uses the publishable key
  exclusively, so every query it issues is subject to RLS. A test scans `src/`
  and fails if a service role reference ever appears.
- **The background worker uses a modern secret key** — _implemented in
  Stage 6_. A worker has no user session, so it needs a trusted server
  credential: `SUPABASE_SECRET_KEY`, Supabase's current `sb_secret_…` form,
  which replaces the legacy service role JWT. It is independently rotatable,
  instantly revocable, and **refused by Supabase from a browser origin**. It is
  read in exactly one module, the client is built lazily so no build needs it,
  and a test asserts it appears in no client component. Because it bypasses
  RLS, every worker query filters `owner_id` explicitly.
- **Ownership checks in application code** _(planned)_ for models beyond
  `profiles`, so a bug in one layer cannot widen access on its own. Defence in
  depth: both layers, not one.

## Input and request handling _(planned)_

- **File validation.** Uploads are validated for type, size and content before
  being stored or processed. Do not trust a client-supplied MIME type or
  filename extension.
- **Request limits.** Rate limits on authentication, OAuth callbacks, upload
  endpoints and publish triggers. Body size limits on upload routes.

## Auditability _(planned)_

- **Audit logs** record security-relevant actions: sign-in, account connect and
  disconnect, approval and re-approval, publish attempts, and destructive
  operations. See `AuditLog` in [database-plan.md](./database-plan.md).
- Audit records capture who, what, and when — never the secret values involved.

## Publishing safety

- **Human approval before publishing** — _implemented for the approval half_.
  Approval is explicit, per platform variant, and refused unless the content
  item's Scripture is manually verified and the required production assets
  exist. No automatic-approval path exists anywhere. Nothing publishes, so
  there is no automatic-publish path either.
- **Editing approved content invalidates approval** — _implemented_. Changing
  Scripture, captions, titles, descriptions, hashtags, CTA, thumbnail text or
  the selected video withdraws the approval and pauses anything scheduled on
  it. This is enforced by comparing a stored SHA-256 fingerprint of the
  publication-sensitive content, in domain code called from every write path —
  **not** by a warning in the interface. See
  [stage-5-approval-scheduling.md](./stage-5-approval-scheduling.md) and
  [state-machines.md](./state-machines.md).
- **Scheduling re-checks approval on the server.** The page's belief that
  something is approved is never accepted as evidence; the fingerprint is
  recomputed from stored records in the request that saves the schedule.
- **A schedule whose approval has gone is paused, not left running.** A stale
  approved item is never left sitting in the calendar as though it were still
  agreed.
- **Never fake a successful publish.** If a publish did not genuinely reach the
  platform, it is recorded as a failure. A completed code path is not evidence
  of a completed publish.

### The same rule, enforced for publishing — _implemented_

`scheduled_posts` cannot record `posted` without the platform's own post id,
and `publish_attempts` cannot record `succeeded` without one; an attempt made
with no provider cannot succeed at all. **No provider exists**, so the
execution-time safety gate refuses every run before anything is sent, and the
refusal is written down.

A completed background job is not evidence of a completed publish, and nothing
in this codebase treats it as though it were.

Publishing diagnostics are sanitised before storage: bearer tokens, JWTs,
`sb_secret_…` and `tr_…` keys and named credentials are redacted **before**
truncation, so a secret cannot survive by sitting past the cut.

### The same rule, already enforced for rendering — _implemented_

`render_jobs` cannot record a `completed` render without an output media asset,
and cannot record a `failed` one without a reason. No rendering provider is
connected, so every render request is refused and written down as a failure
with its reason. The application has no code path that writes `completed`;
only something that produced a file could. See
[stage-4-video-studio.md](./stage-4-video-studio.md).
