# Stage 9 — TikTok publishing

TikTok is the third publishing provider, and the first where **"it worked" has
more than one meaning**. Everything in this stage follows from keeping those
meanings apart.

---

## 0. Status, in the five words that must never be merged

| Status            | TikTok, as of this stage                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IMPLEMENTED**   | Yes. OAuth, account discovery, creator capability, all three delivery modes, chunked `FILE_UPLOAD`, status polling, reconciliation, settings UI, manual fallback, audit events. Covered by 103 unit tests.                                                                                             |
| **CONNECTED**     | **No.** No TikTok account has been authorised. `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` and `TIKTOK_REDIRECT_URI` are unset, and no owner Supabase Auth account exists yet.                                                                                                                         |
| **LIVE-VERIFIED** | **No.** Every test runs against a fake TikTok. No request has reached `open.tiktokapis.com`, and no TikTok post, draft or upload session has ever existed.                                                                                                                                             |
| **BLOCKED**       | Direct public posting is blocked by TikTok's **content-posting audit**, which this application has not applied for or received. Until it passes, an unaudited client is restricted to `SELF_ONLY`. Connecting at all is blocked until Dave creates the TikTok app and the owner Supabase Auth account. |
| **DEFERRED**      | `PULL_FROM_URL` (refused on security grounds, not postponed). TikTok photo mode. Comment, message and analytics access. A dashboard media-download endpoint — the manual fallback names the Drive file instead of re-serving it. Webhooks.                                                             |

These are five different questions and this document never answers one with
another. "Implemented" is a fact about this repository. "Connected" is a fact
about Dave's TikTok account. "Live-verified" is a fact about what an external
platform actually did — and it is the only one that could ever justify the word
_posted_.

## 1. The three outcomes

| Mode          | What happens                                   | Reported as                                 |
| ------------- | ---------------------------------------------- | ------------------------------------------- |
| `direct_post` | A real, visible TikTok post                    | `succeeded` — **only** with a post id       |
| `inbox`       | The video lands in the creator's TikTok drafts | `incomplete` / `uploaded_to_platform_draft` |
| `manual`      | Caption and settings prepared; nothing sent    | `incomplete` / `ready_for_manual_post`      |

Only `direct_post` can ever produce a publication. An `inbox` upload that TikTok
reports as `PUBLISH_COMPLETE` is a **finished draft**, not a post — the same
TikTok status means two different things depending on how the upload was
started, and `mapPublishStatus(status, mode)` is where that distinction lives.

The database enforces it too: `tiktok_publish_sessions` carries a constraint
that an `inbox` session can never reach `published`.

### Why `manual` exists

TikTok's `video.publish` scope requires passing TikTok's audit. Until then, a
direct post is limited to `SELF_ONLY` — visible to Dave alone. Manual posting is
the honest fallback: the caption, Scripture and settings are prepared, nothing
is sent, and the Publish Queue says **"Post it by hand"** rather than pretending
anything reached TikTok.

---

## 2. The audit restriction, and what this application refuses to do about it

**An API client TikTok has not audited can only post `SELF_ONLY`.** TikTok
enforces this two ways: it refuses a `privacy_level` it did not return for that
specific creator, and for an unaudited client it does not return the public
options at all.

So:

- The audience list shown in Caption Studio is built **entirely** from
  `creator_info/query`, read live, per creator, at the moment the form is
  rendered. `PRIVACY_LEVELS` in `config.ts` exists only to recognise TikTok's
  values, never to offer them.
- When TikTok returns nothing, the form offers nothing and says so. An empty
  list is not "all of them".
- `privacy_level` has **no default** — not in the database, not in
  `defaultTikTokMetadata`, not in the form. A default would be this application
  choosing an audience for Dave's content.
- There is no "Post publicly" control that could not work. When only `SELF_ONLY`
  comes back, the interface states plainly that a direct post would be visible
  to Dave alone.

The check runs again at publish time, before a single byte is uploaded — a
saved audience can stop being valid when an account changes or an audit lapses,
and discovering that after uploading a whole video is worse than discovering it
before.

---

## 3. Media delivery: `FILE_UPLOAD`, never `PULL_FROM_URL`

TikTok accepts media two ways. This application uses `FILE_UPLOAD` only.

`PULL_FROM_URL` would require proving domain ownership to TikTok **and**
exposing the video at a publicly reachable URL before it was published. That is
the same trade refused for Instagram images in Stage 8, refused here for the
same reason: a video Dave has not published would be readable by anyone who
guessed the URL. **Google Drive files are never made public to satisfy TikTok.**

Bytes are streamed from the approved Drive folder, through this server,
authenticated at both ends.

### Chunking

| Rule                    | Value                                         |
| ----------------------- | --------------------------------------------- |
| Minimum chunk           | 5 MB (except a whole video smaller than that) |
| Maximum chunk           | 64 MB                                         |
| Maximum **final** chunk | 128 MB                                        |
| Maximum chunks          | 1,000                                         |
| `total_chunk_count`     | video size ÷ chunk size, **rounded down**     |

Rounding down is the subtle one. TikTok documents it, and it means the final
chunk carries the remainder and may legitimately exceed `chunk_size`. Rounding
up would produce a last chunk below the 5 MB floor, which TikTok rejects.

`planChunks` returns `null` rather than producing a plan that would fail
partway. Each chunk is read as its own byte range from Drive — Stage 9 added
`openRange` to `StorageMedia` and `MediaSource` for exactly this — so a large
video is never buffered whole.

---

## 4. Never posting twice

TikTok's flow is: initialise → upload chunks → poll a **separate** status
endpoint. By the time the last chunk lands, TikTok has the media and may already
be publishing it. A worker that died in that window and simply retried would
produce a **second post**.

The guard:

1. `tiktok_publish_sessions` is written the moment `publish_id` is known,
   **before a single byte is sent**, keyed on the idempotency key.
2. If the row could not be written, the provider **refuses to upload** rather
   than sending bytes it could never reconcile.
3. Every attempt starts by looking for an existing session. Finding one means
   resuming it — continuing from `chunks_sent`, then polling status — never
   calling `init` again.
4. A session whose `delivery_mode` no longer matches the saved settings is
   refused outright. Continuing would reconcile a draft as a post, or the
   reverse.

`reconcile()` reports a success only for a `direct_post` session that TikTok
confirmed with a post id. An inbox session reconciles to nothing, however far it
got.

### When TikTok says complete but names no post

The provider reports `incomplete` and warns against retrying, because retrying
could post a second copy. It does **not** invent an id, and does not record a
publication it cannot evidence.

---

## 5. Unknown is never success

`mapPublishStatus` maps every unrecognised status to `processing`. TikTok can
add statuses this client has never seen, and the only safe reading of an
unfamiliar value is "we do not know yet". `published` is what permits writing
`posted`, and a guess there would claim a post nobody has seen.

Likewise `isOk()` requires an explicit `error.code === "ok"`. A response with no
error field at all is treated as **not** ok — absence is not confirmation.

---

## 6. Tokens

A third token model, different again from the first two:

| Provider | Refresh token                                        | Access token life |
| -------- | ---------------------------------------------------- | ----------------- |
| Google   | Until revoked                                        | 1 hour            |
| Meta     | **None** — long-lived token refreshes itself         | 60 days           |
| TikTok   | 365 days of **inactivity**, rotated on each exchange | **24 hours**      |

A day-old TikTok access token is already dead, so refreshing on nearly every
publish is the normal case rather than the exception.

Stage 9 made `getLiveCredential` platform-aware rather than building a second
token store. Google and TikTok both exchange a refresh token at a token
endpoint, but they are not interchangeable — TikTok's parameter is `client_key`,
its endpoint is its own, and it reports failure in a 200 body. Instagram is
explicitly absent from that dispatch: Meta issues no refresh token, and a row
reaching that path means something is already wrong.

TikTok **rotates** the refresh token on every exchange, so the new one is stored.
Dropping it would leave the next refresh holding a token TikTok has retired.

---

## 7. What is stored, and where the browser cannot reach

### `tiktok_video_metadata` — owner-readable, RLS with policies

The settings Dave chooses. `privacy_level` is nullable by design. Two
constraints match TikTok's own rules so a bad combination is refused by the
database rather than discovered as an upload failure:

- `tiktok_branded_content_cannot_be_private`
- `tiktok_brand_flags_need_commercial`

### `tiktok_publish_sessions` — **RLS enabled with no policies**

Server-only, unreachable from the browser by construction. It holds the
`publish_id` a retry uses to decide whether a post already exists — a browser
that could write one could manufacture that decision.

The **upload URL is a bearer capability**: anyone holding it can push bytes into
that upload. It is sealed in the same AES-256-GCM envelope as an access token,
is never on a type that could be rendered or serialised, and is deleted the
moment the upload completes.

Constraints:

- `tiktok_published_requires_post_id` — no id, no publication
- `tiktok_draft_has_no_post_id` — a draft never carries a public post id
- `tiktok_inbox_cannot_publish` — an inbox session can never reach `published`

---

## 8. The approval fingerprint

Every TikTok setting is in it: delivery mode, audience, the three interaction
flags, and all three commercial-disclosure flags. Changing any of them withdraws
approval.

**The delivery mode matters most.** Switching a variant from a draft upload to a
direct post changes it from something Dave publishes into something this system
publishes for him — the largest change that can be made to an approved item, and
an approval given before it did not agree to it.

Stage 9 also extracted the platform dispatch into
`src/lib/approvals/platform-settings.ts`. Four places recompute a fingerprint —
the approval queue, the invalidation sweep, the production board and the
publishing worker — and each carried its own nested ternary over the platforms.
With a third platform that stopped being duplication and became a hazard: adding
TikTok to three of the four and missing the fourth would make the worker and the
queue disagree, which either blocks a valid approval or lets a stale one through.

---

## 9. Two gaps this stage closed

### `ready_for_manual_post` and `uploaded_to_platform_draft` were unreachable in TypeScript

Both were named in the database's check constraint from Stage 6 and deliberately
held out of `SCHEDULE_STATUSES` until a provider could genuinely reach them.
That safeguard had quietly become the bug: the worker was already writing
`uploaded_to_platform_draft` for Instagram, and the interface reading it back had
no label to show.

Both are now in the vocabulary, labelled, reachable **only** from `publishing`,
and — the guarantee that matters — **neither can transition to `posted`**. A
draft in TikTok's app and a caption prepared for manual posting are things a
human still has to finish, and this system holds no platform post id for either.

New queue states name them: **"In drafts — not posted"** and **"Post it by
hand"**, both styled as unfinished rather than green beside "Posted".

### Every attempt was recorded with `provider: "none"`

Stage 6 hardcoded it, correctly, because no adapter existed — and the database
constraint `publish_attempts_none_provider_cannot_succeed` exists precisely so a
provider-less attempt cannot record a success.

With adapters registered, that same constraint would have **rejected every
genuine success**. The attempt now names the adapter actually asked, falling
back to `none` when there is none, which keeps the guarantee pointing at the case
it was written for.

### And a new column

`scheduled_posts.outcome_detail` carries the provider's explanation of a
non-publication. Deliberately separate from `last_error_message`: a video sitting
in TikTok's drafts is not an error, and merging the two would make every
successful draft upload read as a failure. `publish_attempts.status` gained
`incomplete` for the same reason.

---

## 10. Scopes

| Scope             | Why                                      |
| ----------------- | ---------------------------------------- |
| `user.info.basic` | Identify the account after authorisation |
| `video.upload`    | Send a video to the creator's drafts     |
| `video.publish`   | Post directly — **needs TikTok's audit** |

Nothing about comments, messages or analytics is requested.

TikTok's consent screen lets scopes be declined individually, so the callback
checks what came back. **Upload without publish is a real, working draft
connection** and is recorded as one — that is genuinely what TikTok granted.
Neither scope is refused outright, because such a connection could do nothing.

---

## 11. Connecting, and disconnecting

The callback order is the same as Google's and Meta's, for the same reasons:

1. **Consume the single-use state first**, before the code is exchanged. That is
   what stops a crafted callback URL attaching somebody else's TikTok account,
   and what stops a replay.
2. Exchange server-side. The client secret never touches a browser.
3. **Identify the account before recording anything.** `user/info` proves which
   account. A connection is never recorded from a manually supplied id, and never
   from the token alone.

The username — needed to build a post URL later — comes from `creator_info`,
because `user.info.basic` does not carry it. Its absence is not fatal: the
connection is real either way, and `postUrl` returns `null` rather than guessing
a link that leads nowhere.

Nothing TikTok returned is echoed into the redirect. Callback URLs end up in
browser history and referrer headers.

**Disconnect revokes at TikTok first**, then clears locally — a live grant
nobody can see is worse than one that is visibly still there. TikTok does offer a
revocation endpoint, so unlike Instagram this is a genuine withdrawal. If TikTok
does not confirm, the notice says so plainly rather than reporting a clean
disconnect. **Posts already made are never touched.**

---

## 12. Setting up the TikTok app

1. Create an app at [TikTok for Developers](https://developers.tiktok.com/).
2. Add **Login Kit** and **Content Posting API**.
3. Request the scopes in §10.
4. Register the redirect URI as `<APP_URL>/api/oauth/tiktok/callback`, exactly.
5. Copy the **client key** and **client secret** into `TIKTOK_CLIENT_KEY` and
   `TIKTOK_CLIENT_SECRET`. The variable is `CLIENT_KEY`, not `CLIENT_ID` —
   TikTok's own parameter name is `client_key`, and `client_id` is rejected
   without explanation.
6. For direct posting, apply for TikTok's **content-posting audit**. Until it
   passes, expect `SELF_ONLY` only, and use draft uploads or manual posting.

---

## 12A. The manual fallback

TikTok's direct posting needs an audit this application does not have, and a
connection can be granted without the publish scope at all. Neither is a reason
to leave Dave with nothing, so a `manual` variant produces a **posting kit** on
its Publish Queue row rather than a dead end.

The kit carries:

- the media **filename** and where it lives — named, never linked
- the **caption**, built by the _same_ function the provider would have used
- the hashtags, listed separately for a composer that wants them apart
- every **setting to match by hand**, with the commercial-content declarations
  marked as declarations rather than preferences
- an ordered **checklist**, ending with "check the Scripture reads exactly as
  approved" and "mark it posted by hand — this dashboard did not publish it"

The copy button exists for one reason: a retyped Scripture quotation is a
**silently altered** one, which is the failure this project most needs not to
happen. The caption reaches TikTok by clipboard, not by memory.

### What the kit deliberately does not contain

**No download link, and no URL of any kind.** The file stays in Drive, already
reachable by whoever is signed into that account. A link here would be either
useless (a Drive URL only works for someone already signed in) or a permanent
public exposure this application refuses to create. A server-authorised
streaming endpoint was considered and judged unnecessary: the manual poster is
Dave, on a device already signed into the Drive account the file lives in.

`ready_for_manual_post` is **not success**, and nothing on the panel says
otherwise.

---

## 13. What Stage 9 does **not** do

- **No `PULL_FROM_URL`.** See §3.
- **No public Drive links.** Nothing in this application can make a Drive file
  public; the scope is read-only.
- **No photo posts.** TikTok's photo mode is not implemented, and nothing claims
  it is.
- **No comment, message or analytics access.** Not requested, not built.
- **No fabricated post ids.** There is no code path that produces a TikTok post
  id this system was not given by TikTok.
- **No live verification.** Every test in `tests/unit/tiktok-publishing.test.ts`
  and `tests/unit/tiktok-provider-behaviour.test.ts` runs against a fake TikTok.
  They prove the provider's decision-making, **not** that a post has ever
  reached TikTok. No publish has been verified against the live platform.

---

## 14. Provenance

Endpoints, scopes, token lifetimes, chunk limits and the audit restriction were
read from TikTok's official developer documentation at
<https://developers.tiktok.com/doc/> at the time of implementation
(August 2026). Nothing here comes from a blog post or an unofficial client.

Where official documentation could not confirm a capability, it is not
implemented and not claimed — TikTok's photo mode and `PULL_FROM_URL` are both
absent for that reason as much as for the security one.
