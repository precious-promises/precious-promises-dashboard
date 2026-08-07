# Stage 2 — Content Library and media foundation

> **Status: implemented.** Content authoring is real: records are created,
> edited, verified and archived in Postgres under Row Level Security.
>
> **Not implemented:** publishing, scheduling, approval, rendering, AI
> generation, analytics, and every platform OAuth flow. No file upload exists
> yet — media is metadata only.

## What Stage 2 added

| Route                     | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `/dashboard/content`      | Library with search and four filters             |
| `/dashboard/content/new`  | Create a draft content item                      |
| `/dashboard/content/[id]` | View, edit, verify Scripture, archive            |
| `/dashboard/media`        | Media asset metadata and storage provider status |

Navigation now has **three** available areas — Dashboard, Content Library and
Media Assets. The other 16 remain unbuilt and carry no `href`.

## Database

Three tables, applied to `precious-promises-dashboard` (`yrlnahnbwrtmljcbfjdg`)
in `supabase/migrations/20260807160000_create_content_library.sql`.

### `content_items`

| Column                          | Type          | Notes                              |
| ------------------------------- | ------------- | ---------------------------------- |
| `id`                            | `uuid`        | PK, `gen_random_uuid()`            |
| `owner_id`                      | `uuid`        | → `auth.users(id)`, cascade delete |
| `title`                         | `text`        | 1–200 characters                   |
| `content_type`                  | `text`        | One of 12 values                   |
| `topic`                         | `text`        | Optional                           |
| `scripture_reference`           | `text`        | Optional                           |
| `scripture_text`                | `text`        | Optional                           |
| `scripture_translation`         | `text`        | Default `KJV`                      |
| `scripture_verification_status` | `text`        | Default `unverified`               |
| `scripture_verified_at`         | `timestamptz` | Null unless verified               |
| `scripture_verified_by`         | `uuid`        | → `auth.users(id)`                 |
| `description`                   | `text`        | Declarations, prayers, commentary  |
| `status`                        | `text`        | Default `draft`                    |
| `created_at` / `updated_at`     | `timestamptz` | `updated_at` by trigger            |

A check constraint keeps verification metadata coherent: `scripture_verified_at`
is non-null exactly when the status is `manually_verified`, and null otherwise.
That makes the "verified on…" line in the interface impossible to render for
unverified wording.

**Content types:** the eight YouTube variants, three Instagram variants and
`tiktok_video`. **Statuses:** `draft`, `ready_for_review`, `archived` — the
approval and publishing statuses from
[state-machines.md](./state-machines.md) are deliberately absent, because
offering a status the system cannot honour would let the interface assert
something untrue.

Vocabulary is enforced with check constraints rather than Postgres enums, so
adding a content type later is an ordinary migration rather than an `ALTER TYPE`
with transaction restrictions.

### `media_assets`

Metadata only: name, media type, storage provider, external file id or URL,
mime type, size, dimensions, duration and rights status. **There is no binary
column.** Files live in Google Drive (planned), Supabase Storage or an external
location — never in Postgres.

### `content_media`

Join between the two, carrying `purpose` (primary, thumbnail, background,
audio track, supporting) and `sort_order`, unique per
`(content_item, media_asset, purpose)`.

## Row Level Security

All three tables have RLS enabled with **12 policies** — one per operation per
table, `authenticated` only, and the `anon` grant revoked. Supabase's security
advisor reports **no lints**.

`content_items` and `media_assets` restrict every operation to
`(select auth.uid()) = owner_id`.

`content_media` has no `owner_id` of its own; ownership is inherited through the
parent content item. Writes additionally require ownership of the media asset,
so a user cannot attach somebody else's asset to their own content and read its
metadata through the join.

UPDATE policies carry both `using` and `with check` throughout: `using` decides
which rows may be updated, `with check` decides what they may become. Without
the latter a user could reassign `owner_id` away from themselves.

## Two rules that live in code, not in the UI

### `owner_id` never comes from a submission

Ownership is read from the authenticated session in the server action. The Zod
schemas do not define an `owner_id` field at all, so a smuggled value is
stripped before it reaches the database layer — and RLS would reject it even if
it were not. Three tests assert this from different directions: the create
payload, the update payload, and the `FormData` reader.

### Editing verified Scripture invalidates the verification

`src/lib/content/verification.ts` holds this as pure functions over plain
values. Every write path runs through `resolveVerificationAfterEdit`.

| Before                  | Scripture edited?         | After                                     |
| ----------------------- | ------------------------- | ----------------------------------------- |
| `manually_verified`     | Reference or text changed | `verification_required`, metadata cleared |
| `manually_verified`     | Only whitespace changed   | unchanged — still verified                |
| `manually_verified`     | Title/description only    | unchanged — still verified                |
| `unverified`            | Anything                  | `unverified`                              |
| `verification_required` | Anything                  | `verification_required`                   |

Verification attests to a specific wording of a specific reference. If either
changes, the earlier confirmation describes something that no longer exists.

It lives in the domain layer rather than in a form handler because a UI-only
version would be bypassed by the first server action that forgot to call it.

Verification also refuses when there is no reference to verify — confirming an
empty field would record an assertion about nothing.

## Dashboard counts are now real

`Content Ready` and `Drafts` are live `count` queries against `content_items`,
scoped to the owner. They are often still zero, but now because the database
says so rather than because the number was written into the markup.

`Scheduled` and `Published This Week` remain hardcoded zeros with notes saying
why — those systems do not exist, so there is nothing to count.

## Storage providers

`src/lib/storage/provider.ts` declares the `StorageAdapter` seam Google Drive
will slot into. **There is no implementation**, deliberately: a stub returning
plausible values would be indistinguishable from a working integration at the
call site.

All three providers report **Not connected**, which is a fact rather than a
placeholder — no OAuth flow exists, no credential is stored, and nothing in this
application has contacted Drive.

Google Drive remains the planned primary library for large media.

## Testing

172 unit and component tests, 13 Playwright tests.

Stage 2 added coverage for the verification rule, content and media schema
validation, the `owner_id` guard, filter parsing (including `ilike` escaping so
a `%` in a search term cannot silently widen the query), library components,
and navigation activation.

Component tests render real components with plain props — Supabase is not
mocked anywhere.

### Deferred: authenticated end-to-end testing

**Stage 1 authenticated visual E2E is deferred pending the owner account.**

The Supabase project has no `auth.users` rows, so no session can be established.
Creating a fake session would exercise the fake rather than the integration, and
inventing an account is out of scope.

What this leaves unverified end to end: signed-in dashboard rendering, the
content create/edit/verify/archive round trip against the live database, the
mobile drawer in a real browser, and logout.

What **is** verified anonymously: every protected route redirects to `/login`,
the public pages render at 390px and 1440px, and the health endpoint answers
without a session.

This is a deferral, not a failure — nothing was tried and found broken. Once the
owner account exists, an authenticated Playwright project reading credentials
from `E2E_OWNER_EMAIL` and `E2E_OWNER_PASSWORD` becomes possible.

## Not built in Stage 2

- File upload, download or streaming
- Google Drive, YouTube, Instagram or TikTok OAuth
- AI generation of any kind
- Video rendering
- Publishing, scheduling and approval workflow
- Analytics
- Attaching media to content from the interface — the `content_media` table and
  its policies exist, but no UI writes to it yet
