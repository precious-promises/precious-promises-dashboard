# Stage 3 — Scripture, Script and Caption Studios

> **Status: implemented.** The writing half of the workflow is real. Scripture
> can be reviewed and verified, scripts are written with full revision history,
> and per-platform captions are drafted.
>
> **Not implemented:** AI generation, video production, rendering, approval
> execution, scheduling, publishing, analytics, Google Drive and ElevenLabs.
> Nothing in this stage sends anything anywhere.

## What Stage 3 added

| Route                  | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `/dashboard/scripture` | Review and verify Scripture across content  |
| `/dashboard/scripts`   | Write scripts; every save is a new revision |
| `/dashboard/captions`  | Draft per-platform captions and metadata    |

Navigation now has **six** available areas. The other 13 remain unbuilt and
carry no `href`.

## Database

`supabase/migrations/20260807180000_create_writing_studios.sql`, applied to
`precious-promises-dashboard` (`yrlnahnbwrtmljcbfjdg`).

### `script_revisions`

| Column                                                                | Type          | Notes                          |
| --------------------------------------------------------------------- | ------------- | ------------------------------ |
| `id`                                                                  | `uuid`        | PK                             |
| `owner_id`                                                            | `uuid`        | → `auth.users(id)`, cascade    |
| `content_item_id`                                                     | `uuid`        | → `content_items(id)`, cascade |
| `revision_number`                                                     | `integer`     | ≥ 1, unique per content item   |
| `hook` / `explanation` / `declaration` / `prayer` / `outro` / `notes` | `text`        | The written sections           |
| `created_at`                                                          | `timestamptz` |                                |

**Append-only in practice.** The save action always `INSERT`s; nothing updates
an existing revision. `unique (content_item_id, revision_number)` makes a
reused number a database error rather than a silent overwrite.

### `platform_variants`

Per-platform title, caption, description, hashtags (a `text[]`, not a delimited
string), first comment, CTA and thumbnail text, plus a `review_state` of
`draft` or `ready_for_review`.

Two constraints worth noting:

- `unique (content_item_id, platform, variant_type)` — one variant of a kind
  per item; re-saving replaces the draft rather than accumulating duplicates.
- `platform_variants_type_matches_platform` — an `instagram_reel` cannot be
  filed under `youtube`. Without it, a future integration would eventually
  publish a variant to the wrong platform. The same pairing is enforced in
  `src/lib/variants/types.ts`, because this is not a mistake worth leaving to
  one layer.

### What both tables deliberately lack

**Neither has a Scripture column.** Scripture lives on `content_items` and
nowhere else. A script cannot carry a verse and a caption cannot carry a verse,
so neither writing surface can alter one. That is a structural guarantee, not a
convention someone has to remember.

## Row Level Security

Both tables: RLS enabled, `anon` grant revoked, **8 policies** — one per
operation per table, `authenticated` only. **Security advisor: no lints.**

Beyond `owner_id = auth.uid()`, every write also proves the **parent content
item belongs to the same caller**:

```sql
and exists (
  select 1 from public.content_items ci
  where ci.id = content_item_id and ci.owner_id = (select auth.uid())
)
```

Row ownership alone would let a user attach a script or a caption to somebody
else's content.

## Scripture Studio

A **review surface, not an editor**. Scripture can be read and verified here;
changing the wording happens in the Content Library, through the same path that
already resets verification.

Filters: All, Unverified, Verification Required, Manually Verified.

Nothing on the page generates, autocompletes, rewrites, spell-corrects or
translates a verse. `ScriptureReadOnly` renders text and accepts no input —
a test asserts it contains no `input`, `textarea`, `contenteditable` or `form`.

The Stage 2 rule is untouched: editing a verified reference or text still moves
the item to `verification_required` and clears the metadata.

## Script Studio

Six sections — hook, explanation, declaration, prayer, outro, private notes —
with the Scripture displayed read-only alongside.

**Every save creates a new revision.** The button says which number it is about
to write ("Save as revision 4"), because a save that silently replaced the
previous draft would destroy the record of what was actually written.

Revision history is a list of collapsible entries showing each revision's
spoken sections. Private notes are excluded from the spoken piece.

A disabled **Generate with AI — Coming Soon** control marks where AI will go.
It is a genuinely `disabled` button, not a styled div, so it stays out of the
tab order.

## Caption Studio

One platform at a time. Showing three editors side by side would invite
copy-paste between them, which is the opposite of why platform variants exist.

Character counters are **informational only**. This codebase does not assert a
platform's character limit unless it has been verified against current official
documentation, and none has — see [api-integrations.md](./api-integrations.md).
The counter counts; it says nothing about whether a value would be accepted.

**Marking a variant ready for review publishes nothing.** No integration reads
that state, no scheduler exists, and the page says so in words.

An empty variant cannot be marked ready — putting a placeholder in front of a
human as though it were work.

## Content detail integration

`/dashboard/content/[id]` gained a Studios panel showing, from real records:

- Scripture verification status, linking to the Scripture Studio
- Script status — "No script" or "Revision X"
- Each platform — Draft, Ready for review, or None

Plus the computed production stage.

## Production stage logic

`src/lib/production/stage.ts` classifies an item into the approved workflow.
The Production Board is **not activated**; the logic is used on the content
detail page and for a dashboard count, so it is exercised rather than
speculative.

Read top-down, first match wins:

| Condition                          | Stage                      |
| ---------------------------------- | -------------------------- |
| Archived                           | `plan` (out of production) |
| Has Scripture that is not verified | `verify_scripture`         |
| Item or a variant marked ready     | `review`                   |
| Has a script                       | `write`                    |
| Otherwise                          | `plan`                     |

**Scripture needing attention outranks everything.** An item whose verification
lapsed is not "in writing" — it is waiting on a decision about its Scripture,
and treating it otherwise would let unchecked wording drift downstream.

`produce`, `approve`, `schedule` and `publish` are listed in the vocabulary but
**nothing can be classified into them**, because those systems do not exist. A
test asserts this across every input combination.

## Scripture safety guarantees, and how they are tested

| Guarantee                                     | How it is enforced                                                                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A script cannot modify Scripture              | No Scripture column; schema defines no such field                                                                                              |
| A caption cannot modify Scripture             | Same                                                                                                                                           |
| `owner_id` never comes from a form            | Absent from every schema; read from the session                                                                                                |
| Verified Scripture edits reset verification   | Stage 2 domain rule, unchanged                                                                                                                 |
| Declaration and prayer stay separate          | Distinct columns; distinct form fields                                                                                                         |
| Written prose is never presented as Scripture | Only `ScriptureReadOnly` renders a `blockquote`; a test scans every `.tsx` and fails if a declaration, prayer, hook or outro is passed into it |

## Dashboard

Four real counts now: Drafts, Ready for Review, Scripture to Verify, and
Scripts In Progress — all live queries.

Scheduled and Published This Week remain **0**, with notes saying why. Those
systems do not exist.

## Testing

**224 unit and component tests, 13 Playwright tests.**

New suites: `script-revisions.test.ts`, `platform-variants.test.ts`,
`production-stage.test.ts`, `scripture-safety.test.tsx`.

Anonymous Playwright coverage extended to the three new protected routes.

### Deferred: authenticated end-to-end testing

**Still deferred pending the owner Supabase Auth account.** The project has no
`auth.users` rows, so no session can be established.

Unverified end to end: the write → save revision → verify → caption round trip
against the live database.

Verified anonymously: all six protected routes redirect to `/login`.

This is a deferral, not a failure.

## Not built in Stage 3

- AI generation of any kind
- Video production and rendering
- Approval execution — `approved` and `rejected` are deliberately absent from
  `review_state`
- Scheduling and publishing
- Analytics
- Google Drive and ElevenLabs
- The Production Board interface — only its classification logic exists
