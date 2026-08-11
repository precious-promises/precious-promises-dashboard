# Stage 7 — YouTube connection and publishing provider

Stage 7 builds the first genuine external integration: a Google OAuth 2.0
connection and a YouTube Data API v3 publishing provider.

Read this section first, because it is the honest summary of what Stage 7 does
and does not achieve.

---

## What is true after Stage 7

**A real YouTube adapter exists.** It authorises through Google, discovers the
channel, refreshes tokens, opens resumable uploads, sets thumbnails, files
videos in playlists and reads back processing status. Every request it makes is
a genuine request to Google. There is no stub anywhere in it.

**Nothing has been published, and nothing can be yet.** The upload path stops
at one check — `resolveMediaSource` — which returns `media_source_unavailable`
for every asset this system currently holds.

That is not a placeholder. It is the state of the system:

- Stage 2 stores media as **metadata**: a `media_assets` row records a name, a
  type, a size and an external id or URL for a file that lives somewhere else,
  usually Google Drive.
- No Drive integration exists. No storage adapter is implemented.
- Stage 4's render pipeline produces a render _job_, not a rendered file.

So for every asset in the system there is a record of a video and no way to
obtain the video. A provider cannot upload a reference.

Faced with that there were two options: report the truth, or invent a success.
Stage 7 reports the truth. A stub returning plausible bytes would let an upload
appear to work and put a fabricated video id in the database, where nothing
downstream could tell it from a real one — which is precisely what the project
rules forbid.

Everything after the media check is written, typed and tested against a fake
`fetch`. When a storage integration genuinely lands, this provider uploads. No
part of it is waiting to be filled in.

**Instagram and TikTok remain unimplemented**, and `getPublishingProvider`
still returns `null` for both.

---

## Research provenance

Every constant in `src/lib/youtube/config.ts` came from Google's current
documentation at the time of implementation. Nothing was recalled from memory.

Two things about how that research was done need recording honestly:

1. **`developers.google.com` was unreachable from this environment.** The agent
   proxy blocks it. The values below were therefore read from search-engine
   summaries that quote the official pages, cross-checked against the
   `googleapis.dev` API reference where it covers the same field.
2. **Where a value could not be confirmed against current official
   documentation, it is not asserted.** That is the same stance Stage 3 took on
   caption character limits. An unverified limit enforced as though it were real
   rejects content the platform would have accepted.

Pages the values come from:

| Value                                                                                         | Source page                                    |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Authorisation, token and revoke endpoints; `access_type`, `prompt`, `state`                   | Using OAuth 2.0 for Web Server Applications    |
| `videos.insert` request shape, `snippet`, `status`                                            | YouTube Data API — Videos: insert              |
| Title 100 characters, description 5,000 **bytes**, tags 500 characters combined               | YouTube Data API — Videos resource             |
| Thumbnail 2 MB, `image/jpeg` and `image/png`                                                  | YouTube Data API — Thumbnails: set             |
| `playlistItems.insert` body shape                                                             | YouTube Data API — PlaylistItems: insert       |
| `channels.list(mine=true)`                                                                    | YouTube Data API — Channels: list              |
| Quota costs (upload 1,600; thumbnail 50; playlist item 50; list 1) and the 10,000/day default | YouTube Data API — Quota and Compliance Audits |

### Things worth knowing before connecting

**An upload costs 1,600 quota units of a default 10,000 a day. That is six
uploads a day.** Raising it means applying to Google. The Connected Accounts
page says so rather than letting it be discovered as a mid-afternoon failure.

**An unaudited API client cannot publish publicly.** Google restricts API
clients that have not completed its compliance audit: videos uploaded through
one are forced to `private` regardless of the `privacyStatus` requested. So this
application offers only `private` and `unlisted`
(`REQUESTABLE_PRIVACY_STATUSES`). Offering `public` would offer something the
platform overrides.

**Scheduled release is not offered.** `status.publishAt` works only on a video
that is `private` and has never been published — and only if it will actually
become public later. Since an unaudited client's uploads stay private,
`publishAt` would promise a release that never happens.
`SCHEDULED_RELEASE_AVAILABLE` is `false`.

**There is no API field that makes a video a Short.** No parameter of
`videos.insert` requests it and no response field confirms it. YouTube
classifies a video as a Short from the uploaded file — a vertical or square
aspect ratio and a short duration — after processing. So this application does
not claim to create a Short. It uploads a video whose composition was built for
the format and says what it actually knows.

The duration threshold has been raised by YouTube more than once and is a
product rule rather than an API contract, so it is **guidance shown to the
owner, not a rule enforced in code**. Enforcing an unverified threshold would
reject uploads YouTube would have accepted.

---

## The one manual setup step

Everything else in Stage 7 is code. This part cannot be: a Google Cloud project
and an OAuth client are created by a human, in a browser, under Dave's Google
account.

### 1. Create a Google Cloud project

1. Open the Google Cloud Console and create a project — name it something like
   `precious-promises-dashboard`.
2. Under **APIs & Services → Library**, enable **YouTube Data API v3**.

### 2. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen.**
2. User type: **External**. (Internal is only available to Workspace
   organisations.)
3. Fill in the app name, support email and developer contact email.
4. Add these three scopes, and no others:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/youtube`
5. Under **Test users**, add Dave's own Google account — the one that owns the
   Precious Promises channel. While the app is in Testing, only listed test
   users can authorise it.

Leave the app in **Testing**. Publishing it starts Google's verification
process, which is a separate decision with its own timeline. Note that in
Testing mode Google expires refresh tokens after seven days, so the connection
will need re-establishing until the app is published and verified.

### 3. Create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
2. Application type: **Web application**.
3. Authorised redirect URI — exactly, with no trailing slash:

   ```
   https://<your-domain>/api/oauth/google/callback
   ```

   For local development, `http://localhost:3000/api/oauth/google/callback`.
   Google matches this character for character.

4. Copy the client id and client secret.

### 4. Generate the token encryption key

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

### 5. Set the environment variables

In `.env.local` for development, and in the deployment platform's secret
storage for production:

```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=<the exact redirect URI registered above>
TOKEN_ENCRYPTION_KEY=<the base64 key>
SUPABASE_SECRET_KEY=<sb_secret_... from the Supabase dashboard>
```

None of these belong in the repository. `.env.example` holds the keys with no
values.

**Changing `TOKEN_ENCRYPTION_KEY` makes every stored credential unreadable.**
Every connected account then has to be reconnected. There is no key-rotation
path in Stage 7; the envelope format is versioned (`v1.…`) so one can be added
without breaking existing values.

### 6. Create the owner Supabase account

**This has still not been done, and it blocks everything below step 7.**

There is no user in the Supabase project. `/dashboard` refuses an anonymous
visitor, so the Connected Accounts page cannot be opened, the OAuth flow cannot
be started, and no part of Stage 7 has been exercised against a live session.

The account is created by hand, deliberately: this is a private, single-owner
dashboard with **no public registration route**, and inventing credentials —
guessing an email, choosing a password on Dave's behalf — is exactly the kind of
fabrication this project forbids. It also cannot be automated safely from here,
because the password must be chosen by the person who will use it and must never
reach a transcript or a repository.

In the Supabase dashboard for project `precious-promises-dashboard`
(`yrlnahnbwrtmljcbfjdg`):

1. **Authentication → Users → Add user → Create new user.**
2. Enter Dave's email address.
3. Enter a password chosen by Dave. Do not paste it anywhere else.
4. Tick **Auto Confirm User**, so no confirmation email is needed.
5. Create the user.

Then, under **Authentication → Providers**, confirm **Email** is enabled and
that **Allow new users to sign up** is **off**. Leaving sign-up on would make
this a public registration route, which the product does not have.

Sign in at `/login` with those credentials.

### 7. Connect

Open **Connected Accounts** in the dashboard and press _Connect YouTube_.

---

## Status vocabulary

These four words are not interchangeable, and this document uses them exactly.

| Word              | Means                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| **Implemented**   | The code exists, is type-checked and is covered by tests against a fake API. |
| **Connected**     | A real credential is configured and an account is genuinely authorised.      |
| **Live-verified** | It has been run against the real platform and observed to work.              |
| **Deferred**      | Deliberately not attempted yet, with the blocker named.                      |

Where Stage 7 stands:

| Capability                          | Status                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Encrypted credential storage        | Implemented                                                                |
| Google OAuth flow                   | Implemented                                                                |
| Channel discovery                   | Implemented                                                                |
| Disconnect and revoke               | Implemented                                                                |
| YouTube publishing provider         | Implemented                                                                |
| Resumable upload and reconciliation | Implemented                                                                |
| Thumbnails, playlists, processing   | Implemented                                                                |
| A connected YouTube channel         | **Deferred** — no owner Supabase account, no Google client                 |
| Any live YouTube upload             | **Deferred** — blocked twice over: no connection, and no retrievable media |
| Authenticated E2E of these screens  | **Deferred** — no owner account to sign in with                            |
| Instagram, TikTok                   | **Not started**                                                            |

**Nothing in Stage 7 is Live-verified.** Every test mocks Google's HTTP layer,
and they are named as unit tests because that is what they are — calling them
YouTube tests would imply a round trip nobody has made.

---

## The database

`supabase/migrations/20260809120000_create_youtube_connection.sql`.

Five tables, and the security shape matters more than the columns.

### Three tables the browser cannot reach at all

`social_account_credentials`, `oauth_states` and `youtube_upload_sessions` have
**Row Level Security enabled and no policies whatsoever**. With RLS on and no
policy, every operation is refused for every row. `revoke all … from
authenticated` is applied on top.

This is not a convention the application upholds. It is a fact about the tables
that the application has to work around — which is the right way round.

- **Credentials** hold encrypted OAuth tokens. A browser has no business seeing
  even the ciphertext.
- **OAuth states** are single-use CSRF tokens. A readable state token is a
  guessable one.
- **Upload sessions** hold a resumable session URI, which Google treats as a
  **bearer capability**: anyone holding it can push bytes into that upload. It
  is encrypted at rest _and_ unreachable from the browser.

The Supabase security advisor reports these three as `rls_enabled_no_policy`
(INFO). That is the intended shape, not a gap.

### `social_accounts`

Identity only — which channel, whose, in what state. No credential column, and
no column that could hold one.

Owner SELECT, UPDATE and DELETE policies, and **deliberately no INSERT
policy**. An account row is only ever created by trusted server code after a
genuine OAuth exchange _and_ a successful channel lookup. A browser-inserted row
would be a connection nobody made.

Constraints:

- `social_accounts_connected_requires_identity` — a connected account must say
  which account it is.
- `social_accounts_youtube_requires_channel` — a connected YouTube account must
  have a channel id. A Google account is not a channel.

### `youtube_video_metadata`

The YouTube-specific settings for one platform variant. Ordinary content, so
ordinary owner policies apply.

`privacy_status` defaults to `private`. `self_declared_made_for_kids` is
**nullable with no default**, because it is a legal declaration under COPPA and
a default would be this system answering it on Dave's behalf.

### `youtube_upload_sessions`

The reconciliation record. `youtube_upload_sessions_completed_requires_video`
refuses a completed session with no video id.

### `scheduled_posts`

Gains `external_processing_status` and `external_processing_checked_at`.
**Uploaded is not published**: YouTube processes a video afterwards, and
processing can fail — a corrupt file, a copyright claim, a policy rejection.
Recording only the upload would leave this system asserting a video is live when
YouTube took it down before anyone saw it.

---

## Encryption

`src/lib/crypto/envelope.ts` and `src/lib/crypto/secrets.ts`.

**No cryptography is written by hand.** This is AES-256-GCM as provided by
Node's `node:crypto`, which is OpenSSL. What the module does is the part that is
easy to get wrong around a correct primitive: a fresh random IV per encryption,
the authentication tag kept, the output versioned, and a refusal rather than a
guess when anything is off.

GCM rather than CBC because it authenticates: a tampered ciphertext fails to
decrypt instead of decrypting to something attacker-chosen.

Envelope format:

```
v1.<iv base64>.<auth tag base64>.<ciphertext base64>
```

The version prefix is load-bearing. When a second format is needed — a rotated
key, a different cipher — old envelopes must still be readable while new ones
are written differently.

Decryption failures all produce the **same** message. Distinguishing "wrong key"
from "tampered ciphertext" would tell an attacker which of the two they
achieved.

The pure cryptography lives in `envelope.ts`, which reads nothing; the
environment is read only in `secrets.ts`. That split is what lets the algorithm
be tested exhaustively with no configured key and no real credential anywhere
near a test.

---

## The OAuth flow

`src/lib/youtube/oauth.ts`, `src/lib/accounts/oauth-states.ts`,
`src/app/api/oauth/google/callback/route.ts`.

1. **Issue and store a state token.** 32 random bytes, base64url, bound to the
   owner, valid for ten minutes, unique in the database.
2. **Redirect to Google** with `access_type=offline` and `prompt=consent` —
   without both there is no refresh token, and the connection dies at the first
   expiry. `include_granted_scopes=true` so re-authorising does not silently
   drop scopes.
3. **Consume the state first.** Before the code is exchanged, before anything is
   looked up. The consume is a conditional update (`is("consumed_at", null)`),
   so the database decides which of two racing callbacks wins — a read-then-write
   would let both see `null`.
4. **Exchange the code server-side.** The client secret goes in the POST body
   over TLS, never in a URL where every proxy and access log on the way would
   keep it.
5. **Check the granted scopes.** Google's consent screen lets scopes be
   unticked. A connection without `youtube.upload` is refused rather than
   recorded as working.
6. **Look up the channel before recording anything.** A token proves somebody
   authorised something; the channel lookup proves _what_.
7. **Store**, with both tokens encrypted.

Every failure redirects back to Connected Accounts with a short reason code
from this application's own vocabulary. Nothing Google sent — not the error
code, not `error_description`, not the state — is echoed into the response: a
callback URL and its query string end up in browser history and referrer
headers.

`/api/oauth` is in `PROTECTED_PREFIXES`. The state token is the real defence,
but a callback arriving with no session at all is not a flow this application
started, and refusing it costs nothing.

### Refresh

`getLiveCredential` decrypts, checks expiry with sixty seconds of headroom, and
refreshes when needed — writing the new token back before returning it, so a
concurrent worker gets the fresh one rather than repeating the refresh.

A refresh response does **not** repeat the refresh token. The update omits the
key rather than setting it to `null`, which is what preserves the stored value.

`invalid_grant` means the grant is dead — revoked in the Google account,
expired, or invalidated by a password change. The account moves to
`needs_reconnect` rather than being retried, because a revoked grant will be
refused every time.

### Disconnect

Revokes at Google **first**, then clears locally. The other order would leave a
live grant on Dave's Google account that this interface could no longer see or
withdraw — a permission nobody can find is worse than one that is visibly still
there.

The local clear happens either way. If Google did not confirm, the notice says
so plainly instead of reporting a clean disconnect.

---

## The provider

`src/lib/youtube/provider.ts`.

Order of operations inside `publish`:

1. **Reconcile.** Ask whether this exact operation already produced a video id.
   This is the double-publish guard, and it runs before anything else.
2. **Account and permissions.**
3. **Metadata**, validated the same way the interface validates it.
4. **Media** — deliberately before any Google request. An upload costs 1,600 of
   10,000 daily units; failing early on something knowable locally is worth
   doing on purpose. **This is where Stage 7 stops.**
5. **Credentials**, refreshed if needed.
6. **Upload**, resuming an interrupted session where one exists.
7. **Thumbnail, playlist, processing status** — each allowed to fail on its
   own. A rejected thumbnail does not turn a genuinely published video into a
   failed publish; saying otherwise would be as dishonest as claiming a success
   that did not happen.

### Resumable upload and reconciliation

The session row is written **before a single byte is sent**. That ordering is
the whole point: if the worker dies mid-upload, the session is what lets the
next attempt ask YouTube what happened instead of uploading a second copy.

`queryUploadStatus` sends `Content-Range: bytes */<total>` with an empty body:

- `308` — YouTube holds some bytes; `Range: bytes=0-N` says how many.
- `200`/`201` — the video already exists, and its id comes back with it.
- `404`/`410` — the session has expired; there is nothing to resume.

The session URI is keyed by the idempotency key, which binds the schedule, the
platform and the approval. A retry of the _same_ approved operation finds its
session; the same content re-approved after an edit is a different operation and
correctly starts a new upload.

### Error classification

`src/lib/youtube/errors.ts` classifies on the `reason` in Google's error body
rather than the HTTP status alone, because a 403 covers everything from "quota
exhausted, try tomorrow" to "this channel is suspended".

- Quota and rate limits → `provider_rate_limited` (retryable; the day resets).
- Lost authorisation → `provider_permission_revoked` (not retryable).
- Rejected metadata → `invalid_content` (not retryable).
- Unrecognised reason → fall back to the status. Unrecognised status →
  `unknown`, which is **not** retryable. Guessing that an unfamiliar failure is
  transient is how a video gets uploaded twice.

Google's `error.message` goes through the shared redaction pass before anything
is stored.

---

## Approval covers YouTube settings

The approval fingerprint gained a `platformSettings` field.

A YouTube variant carries a privacy status, a made-for-kids declaration, tags
and a thumbnail — all of which change what an audience sees. Approving a variant
and then flipping its privacy or swapping its thumbnail would otherwise publish
something nobody approved.

`youtubeSettingsDigest` canonicalises them in a fixed order. Saving the YouTube
settings form runs the same invalidation as editing a caption: the approval is
withdrawn as a write, and anything scheduled on it is paused.

`null` when nothing has been saved, so saving settings for the first time is
itself a change.

Approval is also blocked while the made-for-kids declaration is unanswered —
`platform_settings_incomplete`. Approving without it would approve an upload
this system would have to answer a legal question to send.

---

## Playlists are chosen, never typed

`loadChannelPlaylists` reads the connected channel's playlists through the
worker credential and the settings form renders them as a `<select>`. A
free-text playlist id would let a typo become a publish that fails at its last
step — or, worse, a plausible-looking id belonging to somebody else's playlist.

When nothing is connected the control is disabled and says why. A playlist the
owner previously chose but the channel no longer returns stays visible and
labelled, so saving the form cannot silently clear it.

Adding to a playlist happens **after** the video exists and is allowed to fail
on its own. It also needs the broader `youtube` scope; an upload-only connection
can publish but cannot file.

## The Publish Queue says what a row is doing

`deriveQueueState` turns the database status into one of: Not connected, Ready,
Uploading, Uploaded/processing, Posted, Failed, Blocked, Stood down.

Two of those exist because the raw status is not honest enough on its own:

- **Uploaded/processing** — `posted` in the database means YouTube returned an
  id. It does not mean the video is watchable. Showing both as "Posted" would
  assert something nobody verified.
- **Not connected** — a row that cannot go anywhere is not merely "Scheduled".
  It is waiting on something the owner has to do.

A processing _failure_ still reads as Posted, because the upload genuinely
happened; the failure belongs on the detail line, not in a claim that the video
does not exist.

## Safety, restated

Nothing in Stage 7 weakens Stage 6's guarantees:

- The **execution-time safety gate** remains authoritative and runs before the
  provider is called. Approval, fingerprint, Scripture verification, claim and
  cancellation are all re-checked against freshly loaded records.
- `posted` still cannot be written without the platform's own post id.
  `postedUpdate` returns `null` without one, and the database refuses the row.
- The one-success-per-operation partial unique index on `publish_attempts` is
  unchanged.
- No token, session URI or scope value is ever written to a log, an error
  message or an audit record. `sanitiseMetadata` drops anything whose key looks
  like a credential.
- `tests/unit/workflow-safety.test.ts` and `tests/unit/publishing-safety.test.ts`
  scan the whole source tree: only `src/lib/youtube` may name a platform host,
  and no Instagram or TikTok host appears anywhere at all.

---

## What Stage 7 does not do

- It does not publish anything. See the top of this document.
- It does not fetch media. No storage integration exists.
- It does not request `public` privacy or scheduled release.
- It does not claim to create a Short.
- It does not implement Instagram or TikTok.
- It does not rotate encryption keys.
- It does not poll processing status on a schedule; status is read once, after
  an upload.

## Two blockers, and they are independent

It matters that these are separate, because fixing one does not unblock a
publish:

1. **No owner Supabase account.** Nothing in the dashboard can be opened, so
   the OAuth flow has never been run and the Connected Accounts page has never
   been rendered against a real session. Fixed by step 6 above.
2. **No retrievable media.** Even with a connected channel, the provider
   refuses at `resolveMediaSource`. Fixed only by a storage integration or a
   working render pipeline — neither of which is Stage 7's scope.

Both must be gone before a single video reaches YouTube.
