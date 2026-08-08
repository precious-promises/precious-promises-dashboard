# Database plan

> **Status: partly implemented.**
>
> `Profile`, `ContentItem`, `MediaAsset`, `ContentMedia`, `ScriptRevision`,
> `PlatformVariant`, `VideoProject`, `VideoScene`, `ProductionAsset` and
> `RenderJob` exist as real tables
> with Row Level Security enforced — see
> [stage-2-content-library.md](./stage-2-content-library.md) for their columns
> and policies. Every other model below is still a design sketch: no table, no
> migration, no data. Field lists for planned models are indicative, not final.

The provider is Supabase Postgres, project `precious-promises-dashboard`
(ref `yrlnahnbwrtmljcbfjdg`) — see [supabase-setup.md](./supabase-setup.md).
Access control is enforced by Row Level Security, with application-level
ownership checks planned alongside it; see [security.md](./security.md).

## Models

### User _(implemented via Supabase Auth)_

The authenticated account, held in `auth.users` and managed by Supabase Auth.
There is no application-owned user table, and none is needed — Supabase owns
identity and credentials.

The product starts as a single-owner founder edition, but ownership is modelled
explicitly from the start so adding tenancy later is an extension rather than a
rewrite.

### Profile — _implemented_

`public.profiles`, one row per authenticated user.

| Column         | Type          | Notes                                                         |
| -------------- | ------------- | ------------------------------------------------------------- |
| `id`           | `uuid`        | Primary key, references `auth.users(id)` on delete cascade    |
| `display_name` | `text`        | Nullable; 1–120 characters after trimming when present        |
| `role`         | `text`        | `not null default 'owner'`, constrained to `owner` or `admin` |
| `created_at`   | `timestamptz` | `not null default now()`                                      |
| `updated_at`   | `timestamptz` | `not null default now()`, maintained by trigger               |

`updated_at` is set by a `before update` trigger rather than trusted from the
client. RLS is enabled with per-user SELECT, INSERT and UPDATE policies and no
DELETE policy — see [supabase-setup.md](./supabase-setup.md).

Kept separate from `auth.users` because authentication data and presentation
data have different lifecycles, and because `auth` is Supabase's schema to
change, not ours.

Preferences and timezone are **not** implemented; they arrive with the features
that need them.

### SocialAccount _(planned)_

A connected external platform account — YouTube, Instagram, TikTok.

Stores the platform identifier, the external account id, granted scopes,
connection status, and the **encrypted** access and refresh tokens. Tokens are
server-only and encrypted at rest. Disconnecting revokes upstream where
supported and deletes the stored credential regardless.

### MediaAsset — _implemented_

A single piece of media — source video, rendered export, audio, image,
thumbnail.

Stores the Google Drive reference, media type, size, duration, checksum and
render provenance. The bytes live in Drive; this record is the metadata and the
pointer.

### ContentItem — _implemented_

The central unit of work: one piece of content moving through the content
lifecycle in [state-machines.md](./state-machines.md).

Holds the lifecycle state, the body copy, Scripture references, and links to
approval history. Scripture is stored distinctly from declarations, prayers and
commentary — they are different content types and must stay distinguishable.

### ContentMedia — _implemented_

Join between `ContentItem` and `MediaAsset`, carrying ordering and role
(primary video, thumbnail, audio track).

A join model rather than a foreign key because one item may carry several
assets, and one asset may be reused across items.

### PlatformVariant — _implemented_

`public.platform_variants`. The per-platform wording of a `ContentItem`: title,
caption, description, hashtags (`text[]`), first comment, CTA and thumbnail
text, plus a `review_state` of `draft` or `ready_for_review`.

A check constraint ties each `variant_type` to its `platform`, so an
`instagram_reel` cannot be filed under `youtube`.

`approved` and `rejected` are deliberately absent from `review_state` — those
belong to the approval stage, which does not exist.

### ScriptRevision — _implemented_

`public.script_revisions`. Append-only script history: hook, explanation,
declaration, prayer, outro and private notes, numbered from 1 and unique per
content item.

**No Scripture column**, by design. Scripture lives on `ContentItem`; a script
holds only the words the owner wrote, so writing a script cannot alter a verse.

### VideoProject — _implemented_

`public.video_projects`. A video composition built from a `ContentItem`: name,
aspect ratio (`9:16`, `16:9`, `1:1`), derived duration estimate, authoring
status and a revision counter.

`duration_estimate_seconds` is recomputed from the scenes on every change, so
it can never disagree with the timeline. `current_revision` increments with
each structural change, which is what lets a `RenderJob` record the composition
it was actually asked to render.

### VideoScene — _implemented_

`public.video_scenes`. One ordered layer: type, text source, optional text,
optional background asset, duration, transition, text position, alignment and
animation preset. `scene_order` is unique per project.

**A Scripture scene holds no verse text.** It stores a reference to its
project's content item and the verse is read from there, enforced by
`video_scenes_scripture_is_referenced` and
`video_scenes_only_scripture_reads_scripture`. A duplicated verse would drift
from the verified record and nobody would notice.

### ProductionAsset — _implemented_

`public.production_assets`. The project-level media slots — background video,
background image, background audio, voiceover, logo, caption track — one asset
per slot, referencing a `MediaAsset`.

### RenderJob — _implemented_

`public.render_jobs`. Every render request, including the ones that were
refused: status, provider, the project revision requested, failure reason and
output asset.

**A completed job requires an output file, and a failed job requires a
reason** — both are check constraints. A code path that finished without
rendering anything cannot be written down as a success. This mirrors
`PublishAttempt` below, for the same reason.

### ScheduledPost _(planned)_

A `PlatformVariant` bound to a publish time and target account.

Holds the scheduled time, timezone, target `SocialAccount`, and current
scheduling state. Only approved content may be scheduled.

### PublishAttempt _(planned)_

One attempt to publish a `ScheduledPost` to a platform.

Records started and finished timestamps, outcome, the platform's response
identifier on success, and the error classification on failure. **Every attempt
is recorded, including failures and retries** — the attempt history is how the
system can be trusted about what did and did not reach an audience. A row is
never rewritten to turn a failure into a success.

### ApprovalAction _(planned)_

A human approval decision against a specific version of a `ContentItem`.

Records the approver, the decision, the timestamp, and the version approved.
Because editing approved content invalidates approval, re-approval creates a
**new** row rather than updating the existing one — the history of what was
approved, and when, stays intact.

### AuditLog _(planned)_

Append-only record of security- and trust-relevant actions: sign-in, account
connect and disconnect, approval and re-approval, publish attempts, and
destructive operations.

Captures actor, action, target and timestamp. Never captures secret values.

### AnalyticsSnapshot _(planned)_

A point-in-time capture of platform metrics for a published post — views, likes,
comments, shares, watch time.

Stored as periodic snapshots rather than a single mutable "current stats" field,
so growth over time is measurable and a platform's later restatement of its
numbers does not erase history.

## Relationship sketch _(planned)_

```
User ──1:1── Profile
User ──1:N── SocialAccount
User ──1:N── ContentItem
User ──1:N── MediaAsset

ContentItem ──1:N── ContentMedia ──N:1── MediaAsset
ContentItem ──1:N── PlatformVariant
ContentItem ──1:N── ScriptRevision
ContentItem ──1:N── ApprovalAction

ContentItem ──1:N── VideoProject ──1:N── VideoScene ──N:1── MediaAsset
VideoProject ──1:N── ProductionAsset ──N:1── MediaAsset
VideoProject ──1:N── RenderJob ──N:1── MediaAsset (output)

PlatformVariant ──1:N── ScheduledPost ──N:1── SocialAccount
ScheduledPost   ──1:N── PublishAttempt
ScheduledPost   ──1:N── AnalyticsSnapshot

User ──1:N── AuditLog
```

## Open questions

Deliberately unresolved until the implementing block:

- Retention policy for `AnalyticsSnapshot` and `AuditLog`
- Whether `PlatformVariant` needs per-platform validation rules in the schema or
  in application code
- Soft-delete versus hard-delete for archived content
- How Scripture references are keyed against a canonical verse source
