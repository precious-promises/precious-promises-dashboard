# State machines

> **Status: planned.** No workflow described here is implemented. This document
> records the approved state transitions so that the blocks implementing them
> have a single reference.

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

## Rendering lifecycle

```
Draft
  → Preparing
    → Rendering
      → Rendered
      → Failed
```

| State         | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| **Draft**     | Render not requested. Inputs may still change.                |
| **Preparing** | Inputs are being gathered and validated ahead of the render.  |
| **Rendering** | The render job is executing on the background worker.         |
| **Rendered**  | Output produced and stored. Ready to be attached to content.  |
| **Failed**    | The render did not produce usable output. Carries the reason. |

Rendering runs on the background worker described in
[architecture.md](./architecture.md); it is never performed in the request path.

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
