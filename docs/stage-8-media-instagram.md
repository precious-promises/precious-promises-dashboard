# Stage 8 — Media retrieval and Instagram

Stage 8 does two things, in a mandated order: it makes media genuinely
retrievable, and then adds Instagram as a second publishing provider.

The order matters because the first unblocks the second. Nothing about
Instagram could be honest while there was no way to obtain a video file.

---

## Status vocabulary

Used exactly, throughout.

| Word              | Means                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| **Implemented**   | Code exists, is type-checked, and is covered by tests against a fake API. |
| **Connected**     | A real credential is configured and an account is genuinely authorised.   |
| **Live-verified** | Run against the real platform and observed to work.                       |
| **Blocked**       | Cannot be done, with the blocker named — not an oversight.                |
| **Deferred**      | Deliberately not attempted yet.                                           |

Where Stage 8 stands:

| Capability                                | Status                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Google Drive storage adapter              | Implemented                                                  |
| Folder-root isolation                     | Implemented                                                  |
| Drive Browser and import                  | Implemented                                                  |
| `resolveMediaSource` returning real bytes | Implemented                                                  |
| YouTube unblocked by storage              | Implemented                                                  |
| Instagram OAuth and account discovery     | Implemented                                                  |
| Instagram **Reels** publishing            | Implemented                                                  |
| Instagram **images**                      | **Blocked** — needs a publicly reachable URL                 |
| Instagram **carousels**                   | **Blocked** — same, per item                                 |
| Instagram **Stories**                     | **Blocked** — same delivery model                            |
| Instagram **first comment**               | **Blocked** — needs a permission this app does not request   |
| Any connected account                     | **Deferred** — no owner Supabase account, no Google/Meta app |
| Any genuine external post                 | **Deferred** — nothing has been published                    |
| TikTok                                    | Not started                                                  |

**Nothing in Stage 8 is Live-verified.** Every test mocks the HTTP layer. They
are named implementation tests because that is what they are.

---

## Research provenance

Constants came from current official documentation at the time of
implementation. As in Stage 7, `developers.google.com` and
`developers.facebook.com` were unreachable from this environment, so values
were read from search-engine summaries quoting those pages and cross-checked
where a second source covered the same field. Where a value could not be
confirmed, **it is not asserted**.

### Google Drive

| Value                                                                  | Source                                     |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| `files.get`, `alt=media` for content                                   | Drive API — Download and export files      |
| Scope requirements, and that `drive.metadata.readonly` cannot download | Drive API — Method: files.get              |
| `files.list` with `'<id>' in parents`                                  | Drive API — Search for files               |
| `supportsAllDrives`, `includeItemsFromAllDrives`                       | Drive API — Implement shared drive support |

### Instagram

| Value                                                    | Source                                  |
| -------------------------------------------------------- | --------------------------------------- |
| Container publishing: create → poll → publish            | Instagram Platform — Content Publishing |
| Media fetched from a **publicly accessible URL**         | Instagram Platform — Content Publishing |
| Reels resumable binary upload via `rupload.facebook.com` | Instagram Platform — Media reference    |
| `instagram_business_content_publish` requires App Review | Instagram Platform — Content Publishing |
| Short-lived → long-lived (60 day) token model            | Business Login for Instagram            |

---

## Part 1 — Google Drive

### The scope decision, stated honestly

**Google has no scope that grants access to a single folder.**

- `drive.metadata.readonly` — can list, but is explicitly not authorised to
  download file contents. Useless for publishing.
- `drive.file` — narrowest, but only covers files the app created or that the
  user hand-picked through the Google Picker. It cannot see a folder of footage
  that already exists.
- `drive.readonly` — read metadata **and** content, across the whole Drive.

So this application requests `drive.readonly`: the narrowest scope that can do
the job, and broader than it needs.

**The folder boundary is therefore enforced in application logic, not by
Google.** That distinction is real and is stated on the Drive Browser page as
well as here. Every listing and every read proves the target descends from
`GOOGLE_DRIVE_ROOT_FOLDER_ID` before anything is returned — but a compromised
server holding the token could read beyond the root, and saying otherwise would
be a false assurance.

### How containment is proved

`src/lib/drive/root.ts`. Drive's hierarchy is a **graph**, not a tree: a file
can have several parents. So the check walks parents breadth-first rather than
following the first one, tracks visited ids so a cycle terminates, and bounds
the depth.

It **fails closed**. A missing parent, a chain deeper than the bound, an API
error — all are "not provably inside the root", which refuses.

Containment is proved **before any byte is read**. The reverse order would mean
a file outside the folder had already been fetched by the time it was refused.

### What the adapter cannot do

The scope is read-only, and there is deliberately no code path that writes,
deletes, or changes sharing. In particular there is **no function that makes a
Drive file public** — a test scans the whole source tree for one.

### The Drive Browser

`/dashboard/drive`. Browses the approved root, shows type and size, and imports
a file as a media asset.

The folder id comes from the query string, so anyone who can open the page can
type one. `browseDrive` re-proves containment on every request and falls back to
the root with an explanation when the check fails. Without that, the page would
be a general-purpose Drive explorer wearing the application's credentials.

**Import registers a reference, not a copy.** The file stays in Drive; the row
records what it is. Every stored fact comes from the Drive API, and the file id
is re-verified at import — a media asset row cannot be created for a file
outside the root.

`source_folder_id` is provenance only. Containment is **re-proved at publish
time**, because a file can be moved in Drive after it was imported.

### What this unblocked

`resolveMediaSource` no longer refuses everything. A Drive-backed video asset
now resolves to a streaming body, and the YouTube provider uploads it.

The refusals that remain are narrower and provider-aware:

- `supabase_storage` — no adapter.
- `external` — nothing fetches arbitrary external URLs. Adding that would make
  this application a URL fetcher pointed at whatever a record contained.
- Drive files outside the root, in the bin, of an unsupported type, or with no
  reported size.

---

## Part 2 — Instagram

### Which API

**Instagram API with Instagram Login** — the Business Login path, which
authenticates a professional account directly. Not the deprecated Basic Display
API, and not the Facebook-Login path, which would require the account to be
linked to a Facebook Page.

### The token model is not Google's

Meta issues **no refresh token**. A short-lived token (about an hour) is
exchanged for a **long-lived token valid for 60 days**, which is then refreshed
by presenting itself.

Two consequences the code respects:

1. `encrypted_refresh_token` stays null for Instagram. The long-lived token is
   the credential. `saveLongLivedConnection` exists for exactly this, and it is
   a narrow difference — same tables, same AES-256-GCM envelope, same account
   row, same deletion path. What is not shared is the pretence that a refresh
   token exists.
2. **A connection left completely unused for 60 days dies.** Nothing here can
   prevent that. The Connected Accounts page says so.

### What is published, and what is refused

**This is the decisive finding of Stage 8's research.**

Meta's container publishing normally fetches media from a URL its own servers
must reach — `image_url` for photos, `video_url` for video. That would mean
exposing Dave's Drive files publicly, or building an endpoint that serves them
to the open internet.

**Reels have a second path.** A container created with `upload_type=resumable`
returns an id whose bytes are POSTed directly to `rupload.facebook.com` with
`offset` and `file_size` headers. No public URL, no exposure, no delivery
endpoint.

**Images and carousels have no such path.** They are documented only with
publicly accessible URLs.

So this integration publishes Reels and refuses the rest with
`media_source_unavailable`, saying why. The alternative — a signed public media
endpoint — would mean this application served Dave's media to anyone holding a
URL. That is a genuinely new attack surface, built to work around a platform
limitation, for a format this product barely uses. Precious Promises is
video-first.

Stories carry the same refusal for the same reason, and additionally expire
after 24 hours, which sits awkwardly with an approval-and-schedule workflow.

**The first comment is not automated.** Posting one needs a comment-management
permission this app does not request, and it is a second write that can fail
independently of the post. It stays stored on the variant as text to copy.

### A container is not a post

Meta's publishing is two-phase, and the code never conflates the phases:

1. `createReelContainer` returns a **container id**. Not proof of anything.
2. The bytes are uploaded.
3. `fetchContainerState` polls until `FINISHED`. An unfamiliar status maps to
   `in_progress`, never to `finished` — because `finished` is what permits the
   publish call.
4. `publishContainer` returns Meta's **media id**. Only this value is ever
   returned as `externalPostId`, and only it lets Stage 6 write `posted`.

The container row is written **before** the publish call. That is what lets a
crashed worker ask Meta about the container rather than creating a second one.

If Meta reports a container as already published but returns no media id, the
provider reports `incomplete` with an explanation — it does not invent an id,
and it does not retry into a possible duplicate.

**Permalinks cannot be constructed.** An Instagram URL uses a shortcode, not
the media id. The permalink is read back from Meta, and stays `null` when Meta
does not return one. A fabricated link would sit in the Publish Queue looking
like proof and lead nowhere.

---

## Approval covers both platforms

The approval fingerprint's `platformSettings` field now carries either
platform's settings:

- YouTube — privacy, made-for-kids, tags, thumbnail, playlist, and the rest.
- Instagram — media type, cover frame, share-to-feed.

Changing any of them withdraws approval and pauses dependent schedules, exactly
as editing a caption does.

---

## Stage 6 safety is unchanged

Nothing in Stage 8 bypasses the worker or weakens the gate:

- The execution-time safety gate still runs immediately before any provider
  call, against freshly reloaded records.
- `posted` still cannot be written without the platform's own post id.
- Idempotency still binds schedule + platform + approval, and the
  one-success-per-operation index is untouched.
- Both providers resolve media **before** contacting the platform, so a
  knowable local failure never costs a quota unit or a container.

---

## The bug fixed along the way

`src/lib/variants/schema.ts` — `optionalText` mapped `""` to `undefined` but
let `null` through to `z.string()`, which rejects it. `FormData.get` returns
`null` for a field that was **not submitted at all**, so any caller submitting a
partial form failed validation with a message about the wrong type.

Invisible in the Caption Studio, which renders every field. It would have bitten
the first narrower form. Fixed, with regression tests covering `null`,
`undefined`, `""` and whitespace — and tests that the trimming, length limits
and required-field behaviour did not change.

---

## Security

- **Drive is read-only**, and no code path writes, deletes or changes sharing.
- **No media is ever made public.** A source-wide test fails on any attempt to
  create a Drive permission or an anyone-with-link share.
- **No arbitrary URL fetching.** The `external` storage provider is refused
  rather than followed, which is what keeps this from being an SSRF primitive.
- **Tokens travel in headers only.** Meta accepts `access_token` as a query
  parameter and much example code uses it; this does not.
- **Platform hosts appear only in integration modules.** A source-wide test
  confines `googleapis.com`, `graph.instagram.com`, `rupload.facebook.com` and
  the rest to `src/lib/{youtube,drive,instagram}`.
- Instagram containers live in a table with RLS enabled and **no policies**,
  like the YouTube upload sessions they mirror.
- Drive filenames are sanitised before reaching an HTTP header — a name with a
  newline in it is a header-injection primitive, and Drive names are
  user-supplied.

---

## Manual setup

In addition to Stage 7's Google Cloud steps:

### Google Drive

1. In the same Google Cloud project, enable the **Google Drive API**.
2. Add `https://www.googleapis.com/auth/drive.readonly` to the OAuth consent
   screen's scopes.
3. Find the folder id of **Precious Promises Content** — open it in Drive and
   copy the id from the URL after `/folders/`.
4. Set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to that id.
5. Connect Drive under Connected Accounts. It is a **separate** authorisation
   from YouTube.

### Instagram

1. Create a Meta app of type **Business** at developers.facebook.com.
2. Add the **Instagram** product and set up **Business Login for Instagram**.
3. Register the redirect URI exactly: `<APP_URL>/api/oauth/meta/callback`.
4. Request the `instagram_business_basic` and
   `instagram_business_content_publish` permissions. The publishing one
   **requires App Review** — until it is granted, the app can act only for
   users who hold a role on it.
5. The Instagram account must be a **professional** (Business or Creator)
   account.
6. Set `META_APP_ID`, `META_APP_SECRET` and `META_REDIRECT_URI`.

---

## What remains blocked

1. **No owner Supabase account.** Unchanged from Stage 7, and still the reason
   nothing has been Live-verified. Steps are in
   [stage-7-youtube.md](./stage-7-youtube.md).
2. **No Google or Meta app configured.** Both need the manual setup above.
3. **Instagram images, carousels and Stories.** Blocked by design, not by
   omission — see above.
4. **Server-side rendering.** Stage 4 still produces a render job, not a file.
   Drive retrieval means media imported from Drive can be published; it does
   not mean this product can yet _make_ a video.
