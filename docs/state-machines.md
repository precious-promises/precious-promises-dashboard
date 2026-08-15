# State machines

> **Status: partly implemented.** Stage 2 built the authoring end — `Draft`,
> `Ready for review` and `Archived` are real statuses on `content_items`, and
> the approval-invalidation rule for Scripture is enforced in domain code.
>
> Stage 3 added the writing steps and a stage classifier
> (`src/lib/production/stage.ts`) covering Plan → Verify Scripture → Write →
> Review. `Produce`, `Approve`, `Schedule` and `Publish` are named but
> unreachable: nothing can be classified into them, because those systems do
> not exist.
>
> Stage 4 added the render job lifecycle below as a real model with real
> constraints, and a `video_projects` status of `draft`, `ready_for_review` or
> `archived`. No renderer is connected, so every render request is recorded as
> a failure.
>
> Stage 5 made `Approved` real — per platform variant, with a fingerprint of
> what was approved — and added scheduling. `Scheduled` now exists as a
> `scheduled_posts` row that records an intention; **nothing executes it**.
>
> Stage 6 made `Queued`, `Publishing`, `Posted` and `Failed` real states on
> `scheduled_posts` and built the worker that moves between them — but
> **nothing can reach `Posted`**: no platform provider exists, and the database
> refuses that status without the platform's own post id. See
> [stage-6-publishing-infrastructure.md](./stage-6-publishing-infrastructure.md).
>
> The remaining planned states:
> those systems do not exist, and the database deliberately refuses those
> values so the interface cannot claim a state it cannot honour.

## Content lifecycle

```
Draft
  → Ready for review
    → Approved
      → Scheduled
        → Publishing
          → Posted
          → Failed
            → Archived
```

| State                | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| **Draft**            | Being assembled. Freely editable. Not visible to any publish path. |
| **Ready for review** | Submitted for approval. Awaiting a human decision.                 |
| **Approved**         | Explicitly approved by the owner. Eligible to be scheduled.        |
| **Scheduled**        | Approved and assigned a publish time. Not yet sent.                |
| **Publishing**       | A publish attempt is in flight against the platform.               |
| **Posted**           | Confirmed live on the target platform.                             |
| **Failed**           | The publish attempt did not succeed. Carries the recorded reason.  |
| **Archived**         | Retired from active use. Retained for the record.                  |

### Rules

- **Approval is explicit and human.** Nothing enters `Approved` automatically.
  There is no path from `Draft` to `Scheduled` that bypasses a person.
- **`Publishing` is a real, observable state.** It is entered when an attempt
  starts and left only when the platform's response is known.
- **`Posted` requires confirmation from the platform.** A publish path that
  completed without a confirmed platform response resolves to `Failed`, not
  `Posted`. Never record a post as published because the code ran to the end.
- **`Failed` is terminal for that attempt, not for the item.** A failed item may
  be corrected and resubmitted, which returns it to the review flow. Each
  attempt is recorded separately (see `PublishAttempt` in
  [database-plan.md](./database-plan.md)).
- **`Archived` is reachable from any resting state** — it is a retirement, not a
  stage of production.

## Render job lifecycle — _implemented as a model_

Stage 4 replaced the earlier sketch with the vocabulary that is actually
stored on `render_jobs`.

```
queued
  → rendering
    → completed
    → failed
    → cancelled
  → failed
  → cancelled
```

| State         | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| **queued**    | Accepted by a provider and waiting for a worker.     |
| **rendering** | A worker is executing the render.                    |
| **completed** | A file was produced. Requires an output media asset. |
| **failed**    | No usable output. Requires a reason.                 |
| **cancelled** | Abandoned before completion.                         |

### Rules

- **`completed` is reachable only from `rendering`.** A job nothing ever picked
  up cannot become a finished render. `canTransitionRender` enforces this and a
  test asserts it for every starting status.
- **`completed`, `failed` and `cancelled` are terminal.** Nothing leaves them; a
  re-render is a new job, so the history of what was asked for stays intact.
- **A completed job must carry an output file**, and a failed one must carry a
  reason. Both are check constraints, not conventions.
- **The application never writes `completed`.** Only a worker that produced a
  file can, and no worker is deployed.

No rendering provider is connected, so today every request is refused and
recorded as `failed` with its reason. A refusal written down is the truth; a
job left sitting in `queued` would look like work in progress. Rendering runs
on the background worker described in [architecture.md](./architecture.md) and
is never performed in the request path — see
[stage-4-video-studio.md](./stage-4-video-studio.md) for why that is a
constraint rather than a preference.

## Approval invalidation

**Editing approved content invalidates its approval.**

Once an item is `Approved`, `Scheduled`, or has been returned to editing, any
change to the following returns it to an unapproved state and requires fresh
human approval:

- Approved media (source or rendered output)
- Scripture text or references
- Captions and copy
- Metadata — titles, descriptions, tags, scheduling parameters
- Thumbnails

### Implemented in full for platform variants in Stage 5, extended in Stage 7

Every publication-sensitive field of a platform variant — Scripture, title,
caption, description, hashtags, first comment, CTA, thumbnail text, the
selected video and its revision, the attached media, and (from Stage 7) the
platform's own settings — is reduced to a SHA-256 fingerprint at the moment of
approval.

The Stage 7 addition is `platformSettings`, extended in Stage 8 to carry
Instagram's settings — media type, cover frame and share-to-feed — and in
Stage 9 to carry TikTok's: delivery mode, audience, the three interaction flags
and all three commercial-disclosure flags. TikTok's **delivery mode** is the
sharpest of them: switching a variant from a draft upload to a direct post turns
it from something Dave publishes into something this system publishes for him,
and an approval given before that change did not agree to it.

Stage 9 also moved the platform dispatch into
`src/lib/approvals/platform-settings.ts`. Four places recompute a fingerprint —
the approval queue, the invalidation sweep, the production board and the
publishing worker — and each previously carried its own branch over the
platforms. With three platforms, adding one to three sites and missing the
fourth would make the worker and the queue disagree, which either blocks a valid
approval or lets a stale one through.

A YouTube variant carries a privacy
status, a made-for-kids declaration, tags and a thumbnail, all of which change
what an audience sees; approving a variant and then flipping its privacy would
otherwise publish something nobody approved. It is `null` for a platform with no
such settings and for a YouTube variant with none saved yet, so saving them for
the first time is itself a change. Any later change moves the
fingerprint, and the approval is withdrawn automatically:

```
approved ──▶ ready_for_review          (approval metadata cleared)
    │
    └──▶ any active schedule ──▶ paused
             reason: "Approval invalidated by content change."
```

Nothing resumes on its own. A paused schedule returns to `scheduled` only after
re-approval and an explicit reinstatement.

The schedule states are `scheduled`, `paused` and `cancelled`; cancellation is
terminal. `publishing`, `posted` and `failed` are deliberately absent because
nothing executes a schedule. Details in
[stage-5-approval-scheduling.md](./stage-5-approval-scheduling.md).

### Implemented for Scripture in Stage 2

The Scripture half of this rule is live. `resolveVerificationAfterEdit` in
`src/lib/content/verification.ts` moves a `manually_verified` item to
`verification_required` whenever the reference or text changes, and clears the
verification metadata. It sits in the domain layer, not the UI, so every write
path obeys it.

The remaining triggers — media, captions, metadata, thumbnails — arrive with
the approval workflow itself.

### Why this rule is absolute

Approval attaches to a **specific version of a specific artefact**, not to the
record that holds it. If a caption could be edited after approval, the approval
would attest to something that no longer exists — and the thing that reaches the
audience would never have been reviewed by anyone.

Scripture makes the stakes concrete: an approved post carrying a verse must
carry the verse that was actually approved.

### Consequences

- An edit to a `Scheduled` item removes it from the schedule. It does not
  silently publish the new version at the old time.
- An edit to an item in `Publishing` does not affect the in-flight attempt; the
  attempt is recorded against the version that was sent.
- Re-approval is a new approval action, recorded separately in the audit trail.

## Instagram container lifecycle — _implemented in Stage 8_

Meta's publishing is two-phase, and the two phases must never be conflated.

```
create container ──> in_progress ──> finished ──> published
                          │              │
                          ├──> error     └──> (publish call returns a media id)
                          └──> expired
```

### Rules

- **A container id is not a post id.** Only the media id returned by
  `media_publish` is, and only it is ever returned as `externalPostId`.
- **An unfamiliar status maps to `in_progress`, never `finished`.** `finished`
  is what permits the publish call, so an unknown value must not reach it.
- **The container row is written before the publish call.** That is what lets a
  crashed worker ask Meta about the container rather than creating a second one
  and posting twice.
- **`published` requires a media id** — enforced by check constraint, as
  `posted` is on `scheduled_posts`.
- A container Meta reports as already published, but for which it returns no
  media id, produces `incomplete` with an explanation. No id is invented, and
  no retry is attempted into a possible duplicate.
- Containers expire. An expired container is a failure, not a silent retry.

## TikTok publish lifecycle — _implemented in Stage 9_

TikTok's flow has three endings, and only one of them is a post.

```
init ──> uploading ──> processing ──┬──> published          (direct_post only)
                                    ├──> uploaded_to_draft  (inbox only)
                                    ├──> failed
                                    └──> expired

manual ──> (nothing is sent)  ──────────> ready_for_manual_post
```

### Rules

- **A draft is not a post.** The same `PUBLISH_COMPLETE` from TikTok maps to
  `published` for a direct post and `uploaded_to_draft` for an inbox upload.
  A check constraint refuses an `inbox` session that reaches `published`.
- **An unfamiliar status maps to `processing`, never `published`.** `published`
  is what permits writing `posted`, and a guess there would claim a post nobody
  has seen.
- **`published` requires TikTok's own post id** — enforced by check constraint,
  and `uploaded_to_draft` is constrained to carry none.
- **The session row is written before a single byte is sent.** TikTok has
  already allocated a `publish_id` by then, and losing it would leave a retry no
  way to ask what happened — it would open a second upload and, for a direct
  post, produce a second post. If the row cannot be written, the provider
  refuses to upload at all.
- **An interrupted upload resumes** from `chunks_sent` into the same session,
  rather than restarting or reporting failure.
- A publish TikTok reports as complete but for which it returns no post id
  produces `incomplete` with an explanation and a warning against retrying. No
  id is invented.

## Incomplete publish outcomes — _implemented in Stage 9_

`ready_for_manual_post` and `uploaded_to_platform_draft` were named in the
database from Stage 6 and held out of the TypeScript vocabulary until a provider
could genuinely reach them. Stage 9 brought them in.

```
publishing ──┬──> posted                       (has a platform post id)
             ├──> uploaded_to_platform_draft ──┐
             ├──> ready_for_manual_post ───────┼──> scheduled | cancelled
             └──> failed ─────────────────────-┘
```

- **Neither incomplete outcome can transition to `posted`.** This system did not
  publish them and holds no platform id proving anybody did.
- Both are reachable **only** from `publishing`.
- Both are non-terminal: the row can be rescheduled or stood down once Dave has
  finished the post in the platform's own app.
- `scheduled_posts.outcome_detail` carries the provider's explanation.
  Deliberately separate from `last_error_message` — a video sitting in TikTok's
  drafts is not an error, and merging them would make every successful draft
  upload read as a failure.

## Metric readings — _implemented in Stage 10_

Not a lifecycle but a state space, and the one Stage 10 turns on:

```
MetricReading ──┬──> measured    (a number, with source, raw name, window, timestamp)
                └──> unavailable (a reason, with an explanation — never a number)
```

There is no third shape and no `value: number | null`. A caller cannot read
`.value` without narrowing on `kind`, so the compiler refuses to let anybody
treat an absence as a number. `formatReading()` prints a digit for `measured`,
including a genuine `0`, and an em dash for every `unavailable`.

The seven reasons an absence can have — `platform_not_connected`,
`analytics_permission_missing`, `provider_not_supported`, `not_yet_fetched`,
`fetch_failed`, `metric_unsupported`, `post_unavailable` — each produce
different words on screen and, where relevant, a different thing to do about it.

## Sync run lifecycle — _implemented in Stage 10_

```
running ──┬──> succeeded   (no error; every window answered)
          ├──> partial     (some snapshots written, some windows failed)
          └──> failed      (nothing written)
```

- **A failure is recorded on the run, never on the data.** No failure branch
  reaches `recordSnapshot`, and nothing in `src/lib/analytics/` calls
  `.delete()`. The last known good figure survives an outage, and is shown with
  its own timestamp so its age is never hidden.
- `partial` exists because collapsing it into either neighbour would lie:
  reporting success would imply the missing windows were zero, and reporting
  failure would discard figures that were genuinely read.

## External availability — _implemented in Stage 10_

A separate axis from the publish lifecycle, and deliberately so:

```
unknown ──┬──> available    (the platform answered for this post)
          └──> unavailable  (the platform can no longer find it)
```

- **This never touches `status`, `external_post_id` or `posted_at`.** The post
  was published; a third party deleting it later does not unmake it, and a
  `posted` row whose video has been removed stays `posted` with its
  availability marked and its full snapshot history intact.

## Render jobs — _worker implemented in Stage 11_

The vocabulary is unchanged from Stage 4; what changed is that `completed`
became genuinely reachable:

```
queued ──> rendering ──> completed     (only the worker, only after the file
   │           │                        verifiably exists in private storage)
   │           ├──────> failed         (with a category and a reason)
   │           └──────> cancelled
   ├──────────────────> failed         (refused at request time, with reason)
   └──────────────────> cancelled
```

- The claim from `queued` to `rendering` is atomic and records the
  deterministic output object key, which is what makes **crash
  reconciliation** possible: a job stuck in `rendering` is reconciled by
  checking whether its recorded output exists — found means the worker died
  after the render (recover and complete), missing means it died before
  (`failed`, category `worker_crashed`). Nothing is silently re-rendered.
- Failure categories: `not_configured`, `invalid_composition`,
  `storage_error`, `render_error`, `worker_crashed`, `transient`. Only
  `storage_error`, `worker_crashed` and `transient` are retryable — a broken
  composition renders broken every time.

## Voice jobs — _implemented in Stage 11_

```
generating ──> completed   (audio stored, media asset recorded)
     └──────> failed       (with a category)
```

The database refuses a `completed` voice job with no output asset and a
`failed` one with no category — the same fabricated-success constraints render
and publish jobs carry.

## Production pipeline — _implemented in Stage 11_

A workflow assistant over the generation steps, **separate from the publish
lifecycle** and ending strictly before it:

```
pending ──> planning ──> generating_text ──> generating_voice ──> rendering ──> ready_for_review
               │              │                    │                 │
               │              └──> failed ──> pending (explicit retry only)
               └─ (any step may be skipped forward; none may run backward)

any active status ──> cancelled (terminal; deletes nothing)
```

- `ready_for_review` is terminal. Review, approval, scheduling and publishing
  remain the existing human paths; no pipeline status names them and no
  transition reaches them.
- Failure at a step blocks all later steps until the owner retries (back to
  `pending`) or cancels.
- Every advance is an explicit owner action. The voice step genuinely
  generates (and fails the job honestly when it cannot); the render step links
  a render job and refuses `ready_for_review` unless that job is genuinely
  `completed`.
