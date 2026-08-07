# Database plan

> **Status: planned. Nothing in this document is implemented.**
>
> There is no database, no schema, no migration and no Supabase project wired to
> this repository. These models describe the approved future data design so the
> block that implements them starts from an agreed shape. Field lists are
> indicative, not final.

The planned provider is Supabase Postgres — see
[architecture.md](./architecture.md). Access control is planned to be enforced
by both application-level ownership checks and Row Level Security; see
[security.md](./security.md).

## Models

### User _(planned)_

The authenticated account. Backed by Supabase Auth.

Holds identity and authentication state only. The product starts as a
single-owner founder edition, but modelling a user explicitly from the start
avoids a painful retrofit if that ever changes.

### Profile _(planned)_

Owner-facing profile information: display name, role label, preferences,
timezone. Separated from `User` so authentication data and presentation data
have distinct lifecycles.

### SocialAccount _(planned)_

A connected external platform account — YouTube, Instagram, TikTok.

Stores the platform identifier, the external account id, granted scopes,
connection status, and the **encrypted** access and refresh tokens. Tokens are
server-only and encrypted at rest. Disconnecting revokes upstream where
supported and deletes the stored credential regardless.

### MediaAsset _(planned)_

A single piece of media — source video, rendered export, audio, image,
thumbnail.

Stores the Google Drive reference, media type, size, duration, checksum and
render provenance. The bytes live in Drive; this record is the metadata and the
pointer.

### ContentItem _(planned)_

The central unit of work: one piece of content moving through the content
lifecycle in [state-machines.md](./state-machines.md).

Holds the lifecycle state, the body copy, Scripture references, and links to
approval history. Scripture is stored distinctly from declarations, prayers and
commentary — they are different content types and must stay distinguishable.

### ContentMedia _(planned)_

Join between `ContentItem` and `MediaAsset`, carrying ordering and role
(primary video, thumbnail, audio track).

A join model rather than a foreign key because one item may carry several
assets, and one asset may be reused across items.

### PlatformVariant _(planned)_

The per-platform rendering of a `ContentItem`: platform-specific caption,
hashtags, aspect ratio, title, and any platform-only fields.

The same content is not identical across YouTube, Instagram and TikTok. Modelling
the variant separately keeps platform quirks out of the core content record.

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
ContentItem ──1:N── ApprovalAction

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
