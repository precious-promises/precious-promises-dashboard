# Stage 5 — Approval, Production Board and Scheduling

> **Status: the workflow-control layer is real. Publishing is not.**
>
> **Implemented:** per-platform approval with a deterministic fingerprint,
> automatic approval invalidation, the Approval Queue, the Production Board,
> the Calendar, scheduled posts, recurring schedule slots and an append-only
> audit log.
>
> **Not implemented:** timed job execution, publishing, social platform APIs, a
> Publish Queue worker, Trigger.dev, external platform posting. Stage 4's
> rendering adapter remains disconnected.

## What Stage 5 added

| Route                   | Purpose                                     |
| ----------------------- | ------------------------------------------- |
| `/dashboard/production` | Production Board — derived workflow columns |
| `/dashboard/approvals`  | Approval Queue — per-platform decisions     |
| `/dashboard/calendar`   | Calendar, scheduling and schedule settings  |

Navigation now has **ten** available areas. The remaining nine are unbuilt and
carry no `href` — including **Publish Queue**, which stays closed because
nothing publishes.

## Approval is per platform variant

There is no item-level approval column anywhere. A `platform_variants` row
carries its own `review_state`, and approving the YouTube wording touches
exactly one row. The Instagram wording is different text that a human has not
read, and treating one decision as covering both is how unreviewed copy reaches
an audience.

```
draft ──▶ ready_for_review ──▶ approved
              │      │              │
              │      └──▶ rejected  └──▶ ready_for_review
              │              │            (publication-sensitive change)
              └──────────────┴──▶ draft
```

Nothing reaches `approved` except from `ready_for_review`, so a draft cannot be
approved in one step and a rejected variant must be edited back into review
first. `canTransitionReview` enforces this and a test asserts it for every
starting state.

The caption editor can only set `draft` and `ready_for_review`
(`EDITABLE_REVIEW_STATES`). Without that split, saving a caption with a
hand-edited field could approve it — bypassing every eligibility check and
writing no fingerprint.

## The approval fingerprint

**Approval attaches to a specific version of specific wording, not to the row
that holds it.** `approvalFingerprint` reduces everything
publication-sensitive to one SHA-256 string, stored as `approval_hash` at the
moment of approval and recomputed whenever it matters.

Included:

| Group     | Fields                                                                                    |
| --------- | ----------------------------------------------------------------------------------------- |
| Identity  | content item id                                                                           |
| Scripture | reference, text, translation, **verification status**                                     |
| Platform  | platform, variant type                                                                    |
| Copy      | title, caption, description, hashtags (in order), first comment, CTA, thumbnail text      |
| Media     | selected video project **and its revision**, every media selection with purpose and order |

Excluded, and asserted to be excluded by a test: `created_at`, `updated_at`,
`approved_at`, `approved_by`, `rejected_at`, `rejected_by`, `rejection_reason`,
`review_state`, `id`, `owner_id`. A volatile value in the fingerprint would
invalidate approvals for reasons that have nothing to do with what gets
published.

Three details that matter:

- **Verification status is in the hash.** An approval was granted against a
  _verified_ verse; if that verification lapses, the approval no longer
  describes the same thing.
- **The video revision is in the hash.** A recut composition is different
  content even when the caption is identical.
- **`null` and `""` do not collide.** A caption that was deleted and one that
  was never written are different states, and collapsing them would let one
  become the other unnoticed.

A **missing** stored hash is never a match. An approval with nothing to compare
against cannot be shown to be valid, and treating "unknown" as "fine" is how
stale content reaches an audience.

## Approval invalidation

**Editing publication-sensitive content withdraws its approval.** Not with a
warning — with a write.

`syncApprovalsForItem` lives in the domain layer and runs from every path that
can change what would be published:

| Path                         | Why it can invalidate                         |
| ---------------------------- | --------------------------------------------- |
| Saving a caption             | Title, caption, hashtags, CTA, thumbnail text |
| Editing the content item     | Scripture reference and text                  |
| Verifying Scripture          | Verification status                           |
| Changing a video composition | Video revision                                |

For each approved variant whose fingerprint no longer matches:

1. `review_state` returns to **`ready_for_review`** — not `draft`. The wording
   is still finished work awaiting a decision; what changed is that the
   decision no longer applies.
2. `approved_at`, `approved_by` and `approval_hash` are cleared. The database
   refuses the combination anyway.
3. Any active schedule on it is **paused** with the reason
   _"Approval invalidated by content change."_
4. Both events are written to the audit log.

Schedules are paused rather than cancelled: the owner's intention to post at
that time has not changed — only the approval behind it has — and cancelling
would throw the slot away on their behalf. **Nothing resumes on its own.**

## What makes a variant approvable

Enforced in `src/lib/approvals/rules.ts` and **re-checked in the server action**
against records loaded in that request:

1. The content item is not archived.
2. The variant is marked ready for review.
3. If the item carries Scripture, that Scripture is **manually verified**.
4. The variant has a title, caption or description — something to review.
5. A content type published as video has a video composition with scenes.
6. A content type published as an image has at least one media asset attached.

Every blocker is returned, not just the first, so the owner sees the whole list
instead of fixing one thing and discovering another.

## The Approval Queue

Sections: **Ready for Review**, **Approved**, **Rejected**, plus drafts.

Each row shows the content title, platform, variant type, Scripture reference
and verification status, script revision, whether a video composition exists,
a caption summary and the last update. A stale approval is called out on the
row itself.

The review detail separates **Scripture** — presented alone, read-only, through
the same component used everywhere else — from Caption, Title, Description,
Hashtags, **Declaration**, **Prayer**, Script and Media. A reviewer must never
have to work out which of these is the verse.

Actions: **Approve**, **Reject** (reason required, by database constraint as
well as by the form) and **Return to draft**.

## The Production Board

Columns: Plan, Verify Scripture, Write, Produce, Review, Approve, Schedule.

**Every column is derived.** There is no stored board position and no action
that sets one. A card sits in Approve because an approval exists _and still
matches its content_, not because somebody dragged it there. Drag-and-drop is
deliberately absent rather than decorative: a drag that moved a card without
meeting the conditions would be the board lying about the work. If it is added
later it must call a domain transition.

The classifier reads top-down, most advanced first, after two overrides:

| Condition                         | Stage                      |
| --------------------------------- | -------------------------- |
| Archived                          | `plan` (out of production) |
| Scripture recorded but unverified | `verify_scripture`         |
| An active schedule exists         | `schedule`                 |
| A **valid** approval exists       | `approve`                  |
| Item or variant ready for review  | `review`                   |
| A video composition with scenes   | `produce`                  |
| A script revision exists          | `write`                    |
| Otherwise                         | `plan`                     |

**Publish is not a column.** Nothing publishes, so there is nowhere for a card
to arrive. A test asserts that no combination of signals can classify anything
into `publish`.

## Scheduling

### The safety rule

A variant may be scheduled only when:

- its `review_state` is `approved`,
- its stored `approval_hash` still matches the fingerprint recomputed **in this
  request**,
- the date and time parse, and
- the time is in the future.

All four are re-checked in the server action. The page may have been rendered
minutes ago and the content edited since; its opinion is not evidence.

The schedule stores the fingerprint it was created against. If the approved
content later changes, that approval is withdrawn and this schedule is paused —
so a stale schedule is never left active.

### Time zones

**Instants are stored in UTC; the zone the owner chose is stored beside them.**
Keep only the instant and a daylight-saving change silently moves the post by
an hour; keep only the wall time and posts cannot be ordered.

Conversions use `Intl`, which ships with the runtime and carries the IANA
database — no timezone package to keep current and no offset table to go stale.
The default zone is **Europe/London** throughout.

A test holds the case that matters: 19:30 in London stays 19:30 in London on
both sides of a clock change, and the two instants differ by 23 hours rather
than 24.

### Duplicates

Scheduling the same variant at the same minute is unusual but not impossible,
so it produces a **warning and a confirmation box**, not a refusal. Cancelled
and paused schedules are not treated as duplicates.

### Schedule states

```
scheduled ──▶ paused ──▶ scheduled   (only after re-approval, explicitly)
     │            │
     └────────────┴──▶ cancelled     (terminal)
```

`publishing`, `posted` and `failed` are **deliberately absent**. They are named
in `FUTURE_SCHEDULE_STATUSES` so the gap is visible in the codebase, and kept
out of `SCHEDULE_STATUSES` so nothing can be written into one today.

Cancellation is terminal: reinstating a cancelled post would resurrect a
decision that was deliberately withdrawn. Schedule a new one.

## Recurring schedule slots

A rule says **when** something could go out. It never says what, it never
creates a scheduled post, and it arrives **disabled**.

The approved Precious Promises rhythm is offered as editable slots:

| Day      | Time  | Slot                 |
| -------- | ----- | -------------------- |
| Tuesday  | 19:30 | Promise Short        |
| Thursday | 19:30 | Prayer / Declaration |
| Saturday | 18:00 | Long-form YouTube    |
| Sunday   | 09:00 | Encouragement Short  |

All Europe/London. Creating them writes four disabled rules and **schedules
nothing**; a disabled rule has no occurrences at all, rather than greyed-out
ones that would imply the schedule exists.

Each occurrence is resolved through the zone individually — adding seven days
to a UTC instant would drift across a daylight-saving boundary and quietly move
the slot.

## Audit log

`public.audit_log`, append-only. There is a SELECT policy and an INSERT policy
and **deliberately no UPDATE or DELETE policy**, so with RLS enabled those
operations are refused for every row.

Recorded: `variant_submitted_for_review`, `variant_approved`,
`variant_rejected`, `variant_returned_to_draft`, `approval_invalidated`,
`post_scheduled`, `schedule_paused`, `schedule_cancelled`,
`recurring_rule_created`, `recurring_rule_updated`.

`sanitiseMetadata` drops any key that looks like a credential and truncates
long strings. An audit log is exactly where a leaked secret would persist
longest, and a log entry is a description rather than a second copy of the
content.

Recording is best-effort and never blocking: a workflow action that succeeded
must not be reported as failed because its log line did not write.

## Database

`supabase/migrations/20260808230000_create_approval_and_scheduling.sql`,
applied to `precious-promises-dashboard` (`yrlnahnbwrtmljcbfjdg`).

New columns on `platform_variants`: `approved_at`, `approved_by`,
`approval_hash`, `rejected_at`, `rejected_by`, `rejection_reason`, with two
check constraints — an approved row must carry all three approval fields, and a
rejected row must carry a reason.

New tables: `scheduled_posts`, `recurring_schedule_rules`, `audit_log`.

RLS on all three: one policy per operation (two for `audit_log`),
`authenticated` only, `anon` revoked. Schedule writes prove the **platform
variant** belongs to the same caller. **Security advisor: no lints.**

## Testing

**478 unit and component tests, 13 Playwright tests.**

New suites: `approval-fingerprint.test.ts`, `approval-rules.test.ts`,
`schedule-timezone.test.ts`, `schedule-rules.test.ts`,
`calendar-mapping.test.ts`, `workflow-safety.test.ts`,
`workflow-components.test.tsx`.

Covered: fingerprint determinism and key-order independence, every
publication-sensitive field moving the hash, excluded fields staying out,
approval eligibility including unverified Scripture, invalidation and its
fallback state, the review and schedule state machines, scheduling requiring a
live approval, stale hashes blocking scheduling, duplicate detection, timezone
conversion across both clock changes, the Europe/London default, recurring rule
validation, derived board states, calendar day mapping in the display zone,
`owner_id` and `approval_hash` absent from every schema, the audit sanitiser,
and a source-wide scan asserting **no platform API is contacted anywhere**.

Anonymous Playwright coverage extended to `/dashboard/production`,
`/dashboard/approvals` and `/dashboard/calendar`.

### Deferred: authenticated end-to-end testing

**Still deferred pending the owner Supabase Auth account.** The project has no
`auth.users` rows, so no session exists and the write paths cannot be exercised
against the live database.

Unverified end to end: submit → approve → schedule → edit → watch the approval
withdraw and the schedule pause, against real rows.

Verified anonymously: all ten protected routes redirect to `/login`.

This is a deferral, not a failure.

## Not built in Stage 5

- **Timed job execution.** Nothing reads `scheduled_posts` and acts on it.
- Publishing of any kind, to any platform
- YouTube, Instagram and TikTok APIs and their OAuth
- The Publish Queue worker, and Trigger.dev
- Live analytics
- Server rendering — Stage 4's adapter is still disconnected
- ElevenLabs and Google Drive OAuth
