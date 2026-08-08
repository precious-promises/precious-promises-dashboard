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
> `Approved`, `Scheduled`, `Publishing`, `Posted` and `Failed` remain planned:
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
