# Database plan

> **Status: partly implemented.**
>
> `Profile`, `ContentItem`, `MediaAsset`, `ContentMedia`, `ScriptRevision`,
> `PlatformVariant`, `VideoProject`, `VideoScene`, `ProductionAsset` and
> `RenderJob`, `ScheduledPost`, `RecurringScheduleRule`, `AuditLog`,
> `PublishAttempt`, `SocialAccount`, `SocialAccountCredentials`, `OAuthState`,
> `YouTubeVideoMetadata`, `YouTubeUploadSession`, `InstagramMediaMetadata` and
> `InstagramPublishContainer`, `AnalyticsSnapshot`, `AnalyticsMetric`,
> `AnalyticsSyncRun`, `GrowthGoal`, `GrowthExperiment` and
> `GrowthExperimentPost` exist as real tables
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

### SocialAccount — _implemented in Stage 7, extended in Stages 8 and 9_

A connected external platform account — YouTube, Instagram, TikTok, and (as a
read-only media source, never a publishing target) Google Drive.

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

### ScheduledPost — _implemented_

`public.scheduled_posts`. A `PlatformVariant` bound to a publish time: the UTC
instant, the IANA timezone the owner chose, a status of `scheduled`, `paused`
or `cancelled`, and the **approval fingerprint the schedule was created
against**.

Only an approved variant whose fingerprint still matches can be scheduled, and
a later edit to that content pauses the schedule with an explicit reason.
`publishing`, `posted` and `failed` are deliberately absent — no worker reads
these rows and no platform integration exists.

The target `SocialAccount` arrives with publishing, which does not exist.

### RecurringScheduleRule — _implemented_

`public.recurring_schedule_rules`. A weekly slot: name, platform, optional
content type, day of week, local time, timezone and an `enabled` flag that
defaults to **false**.

A rule defines _when_ something could go out. It never selects content and
never creates a `ScheduledPost` — a rule that could fill itself would be
publishing on nobody's authority.

### PublishAttempt — _implemented_

`public.publish_attempts`. One attempt to publish a `ScheduledPost` to a
platform: attempt number, idempotency key, status (`started`, `succeeded`,
`failed`, `blocked`, `cancelled`), provider, retryability, a sanitised error
code and message, the external post id and url, and timestamps.

**Every attempt is recorded, including refusals** — the history is how the
system can be trusted about what did and did not reach an audience. There is
no DELETE policy, so a row cannot be removed; and `succeeded` requires the
platform's own post id, so a failure cannot be rewritten into a success.

`blocked` is distinct from `failed`: a failure is the provider saying no, a
block is this system saying no before anything was sent.

A partial unique index on `idempotency_key WHERE status = 'succeeded'` means
one approved operation can succeed at most once.

### ApprovalAction _(planned)_

A human approval decision against a specific version of a `ContentItem`.

Records the approver, the decision, the timestamp, and the version approved.
Because editing approved content invalidates approval, re-approval creates a
**new** row rather than updating the existing one — the history of what was
approved, and when, stays intact.

### AuditLog — _implemented_

`public.audit_log`. Append-only record of workflow actions: submission for
review, approval, rejection, return to draft, approval invalidation,
scheduling, pausing, cancellation and recurring-rule changes.

Captures actor, action, entity type and id, a sanitised metadata object and a
timestamp. **Append-only by RLS**: there is a SELECT policy and an INSERT
policy and deliberately no UPDATE or DELETE policy, so an entry cannot be
rewritten. `sanitiseMetadata` drops any key that looks like a credential.

Sign-in, account connection and publish attempts join it with the stages that
build them.

### AnalyticsSnapshot _(implemented in Stage 10 as `analytics_snapshots`)_

A point-in-time capture of platform metrics for a published post — views, likes,
comments, shares, watch time.

Stored as periodic snapshots rather than a single mutable "current stats" field,
so growth over time is measurable and a platform's later restatement of its
numbers does not erase history.

The individual figures live in `analytics_metrics`, one row per metric, each
carrying `raw_metric_name` — the platform's own name for it — beside the
canonical one. `views_or_plays` can therefore always be traced back to whichever
of `views` or `plays` the platform actually answered with.

Upserted on
`(owner_id, platform, external_post_id, source, observation_window,
observed_on_utc)` — the last a stored generated column holding the UTC day of
`observed_at` — so the same post observed twice in a day updates in place and
observed tomorrow becomes the next point in the series.

**`source` is part of the key**, which is what keeps a manually entered figure
from ever overwriting an API one. It is also what the browser write policy
constrains:

```sql
create policy "Owners can record manual analytics only"
  on public.analytics_snapshots for insert to authenticated
  with check ((select auth.uid()) = owner_id and source = 'manual');
```

A browser cannot insert a row claiming `youtube_api` or `instagram_api` — those
are written only by the worker credential. See
[stage-10-analytics-growth.md](./stage-10-analytics-growth.md).

### AnalyticsSyncRun _(implemented in Stage 10 as `analytics_sync_runs`)_

Every fetch attempt: platform, trigger source, status, counts, error category
and detail. **A SELECT policy and nothing else** — the owner can read the
history of attempts and cannot fabricate one.

This is where a failure is recorded. A failed fetch never touches
`analytics_snapshots`, so the last known good figure survives an outage.

### GrowthGoal, GrowthExperiment, GrowthExperimentPost _(implemented in Stage 10)_

Targets Dave set, hypotheses written before looking, and which posts belong to
which experiment. Goals are stored apart from measured figures so no chart can
plot an intention as an observation.

### Two columns on `ScheduledPost` _(added in Stage 10)_

`external_availability` and `external_checked_at`. When a platform can no longer
find a post, only these change — never `status`, `external_post_id` or
`posted_at`. The post was published; a third party deleting it later does not
unmake it.

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

## Stage 11 additions — _implemented_

Migration `20260815090000_create_production_automation.sql`:

- **`storage.buckets`** gains the private `generated-media` bucket
  (`public = false`, no browser-facing `storage.objects` policy at all).
  Object keys are `<ownerId>/<kind>/<name>.<ext>`; ownership is enforced by
  the key prefix in every worker read/write path.
- **`media_assets`** gains `generated_kind` and `generated_job_id` so a file
  this application rendered or narrated is an ordinary asset with provenance,
  consumable by publishing through the existing media-source seam.
- **`render_jobs`** gains `output_storage_path`, `failure_category` and
  `claimed_at` for the worker's atomic claim and crash reconciliation.
- **`voice_jobs`** — narration runs; completed-requires-output and
  failed-requires-category constraints; browser SELECT-only.
- **`ai_generations`** — full provenance per draft (provider, model, prompt
  template version, Scripture reference used as context, output, status,
  accepted target); accepted-requires-target constraint; browser SELECT-only.
- **`production_jobs`** — the pipeline state machine's record; owner CRUD;
  failed-requires-category constraint.
- **`planner_items`** — planning intent; `target_platforms` checked against
  the platform vocabulary. Not a scheduling table.
- **`licence_records`** — the rights register.
- **`app_settings`** — one preferences row per owner (`unique (owner_id)`).
  Preferences only; no credential column exists.
- **`audit_log`** constraints rebuilt with the Stage 11 actions and entity
  types.

Every new table has RLS enabled, owner-scoped policies (or read-only where the
browser must not write), `revoke` from `anon`, and the `handle_updated_at`
trigger.
