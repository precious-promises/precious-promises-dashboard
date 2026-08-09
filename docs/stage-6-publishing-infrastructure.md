# Stage 6 — Publishing infrastructure

> **Status: the machinery is real. Publishing is not.**
>
> **Implemented:** the Publish Queue, the publishing lifecycle, the Trigger.dev
> task foundation, atomic claiming with an expiring lease, deterministic
> idempotency, `publish_attempts` history, the execution-time safety gate, the
> error classification and retry framework, and the provider adapter contract.
>
> **Not implemented:** YouTube, Instagram and TikTok connections, and any real
> external publishing. **No post can be created on any platform.** Stage 4's
> rendering adapter also remains disconnected.

## What Stage 6 added

| Route                | Purpose                                       |
| -------------------- | --------------------------------------------- |
| `/dashboard/publish` | The Publish Queue: claims, attempts, outcomes |

Navigation now has **eleven** available areas. The remaining eight are unbuilt
and carry no `href` — including **Connected Accounts**, which waits for
Stage 7.

## Research

Verified against current official documentation at the time of
implementation. These constraints change; re-check before extending.

### Trigger.dev

Trigger.dev v4 (`@trigger.dev/sdk` 4.5.10 as installed).

| Concern           | Current API                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Config            | `trigger.config.ts`, `defineConfig({ project, dirs, maxDuration })`                                                        |
| Task              | `task({ id, retry, queue, run })` from `@trigger.dev/sdk`                                                                  |
| Scheduled task    | `schedules.task({ id, cron, run })`                                                                                        |
| Retries           | `retry: { maxAttempts, factor, minTimeoutInMs, maxTimeoutInMs, randomize }`                                                |
| Permanent failure | `throw new AbortTaskRunError(...)` — skips retrying                                                                        |
| Concurrency       | `queue: { concurrencyLimit: n }`                                                                                           |
| Idempotency       | `idempotencyKeys.create()`, then `trigger(payload, { idempotencyKey, idempotencyKeyTTL })`; keys stored 30 days by default |
| Credential        | `TRIGGER_SECRET_KEY` (`tr_dev_…` / `tr_prod_…`)                                                                            |
| Project reference | The `project` field in `trigger.config.ts` — not a secret                                                                  |

**Note on the environment variables in `.env.example`.** `TRIGGER_SECRET_KEY`
matches current guidance exactly. `TRIGGER_PROJECT_REF` is _our_ name for a
value Trigger.dev expects in the config file rather than the environment; the
config reads it from the environment with a fallback so the build never
depends on it.

**Trigger.dev's retries are transport-level and deliberately modest**
(3 attempts, exponential, jittered). Whether a _publish_ should be retried is a
domain decision made by the error classifier below, which knows the difference
between a timeout and a rejected caption.

### Supabase credentials for a worker

Supabase is retiring the legacy `anon` and `service_role` JWTs in favour of
`sb_publishable_…` and `sb_secret_…`. New projects created after 1 November
2025 no longer have the legacy pair — and this project was created on
7 August 2026, so the modern keys are what it has.

The new secret key is the right credential for background work on its merits,
not merely because it is what exists: it is independently rotatable, instantly
revocable, and **refused by Supabase from a browser origin**, which the legacy
JWT could not be.

So the worker credential is **`SUPABASE_SECRET_KEY`**. `.env.example` carries
it as an empty placeholder; `SUPABASE_SERVICE_ROLE_KEY` remains only so an
older deployment does not fail validation, and nothing reads it.

### PostgreSQL claiming

`SELECT … FOR UPDATE SKIP LOCKED` is the standard queue-claiming pattern: it
skips rows another transaction already holds instead of queueing behind them,
so workers run in parallel without duplicating work. A conditional
`UPDATE … WHERE status = … RETURNING` is atomic for a single row.

Advisory locks are only needed for _queue-wide_ constraints — "never more than
N running". This queue has no such constraint: correctness here is per row
plus a unique index on successful attempts. So no advisory lock is used, and
the reason is recorded rather than left as an omission.

## The safety gate

**The most important part of this stage.** Immediately before any provider
call, everything is reloaded from the database and revalidated:

| Check                                                  | Refusal category         |
| ------------------------------------------------------ | ------------------------ |
| The scheduled post still exists                        | `invalid_content`        |
| Not cancelled                                          | `schedule_cancelled`     |
| Not paused                                             | `schedule_paused`        |
| Not already published                                  | `already_published`      |
| This worker still holds the claim                      | `claim_lost`             |
| Status is `queued` or `publishing`                     | `invalid_content`        |
| The variant still exists                               | `invalid_content`        |
| The variant is approved with a stored hash             | `not_approved`           |
| The recomputed fingerprint matches the stored approval | `approval_stale`         |
| The schedule's hash matches the variant's              | `approval_stale`         |
| The content item exists and is not archived            | `invalid_content`        |
| Scripture is manually verified where present           | `scripture_unverified`   |
| The required video or media exists                     | `missing_asset`          |
| A provider is connected                                | `provider_not_connected` |

**Nothing captured when the job was enqueued is trusted.** Hours pass between
scheduling and sending, and in that time the owner may have cancelled it,
edited the caption, un-verified the Scripture or deleted the video. The job
payload carries two identifiers and nothing else, precisely so there is
nothing stale to trust.

Every refusal is non-retryable: a gate refusal is _this system_ saying no, and
retrying without changing anything would be told no again.

## Nothing can publish

Four independent guarantees, any one of which would be enough:

1. **No provider exists.** `getPublishingProvider` returns `null` for every
   platform — deliberately, not as a placeholder for a stub. A stub returning
   a plausible post id would be indistinguishable from a working integration.
2. **The gate refuses.** With no provider, every run stops at
   `provider_not_connected` before anything is sent.
3. **`posted` cannot be constructed.** `postedUpdate` returns `null` without a
   real external post id, and the worker contains no `status: "posted"`
   literal — a test asserts both.
4. **The database refuses it.** `scheduled_posts` will not accept `posted`
   without `external_post_id`; `publish_attempts` will not accept `succeeded`
   without one; and the `none` provider cannot record a success at all.

A Trigger.dev run completing means the _job_ finished. It says nothing about a
platform, and nothing in this codebase treats it as though it did.

## Idempotency

The identity of one approved publishing operation binds three facts:

```
post=<scheduled_post_id>|platform=<platform>|approval=<approval_hash>
```

SHA-256'd, prefixed as `pp_publish_<platform>_<digest>`.

- **A retry of the same operation keeps the same key**, so it cannot post
  twice.
- **Re-approving materially changed content yields a different key**, because
  the approval fingerprint changed. That is deliberate: the new wording has
  never been published and must not be deduplicated against the old.
- **The same wording going to two platforms is two operations.**

Protected in both layers. In code, the worker checks for an existing
successful attempt before proceeding. In the database, a **partial** unique
index on `idempotency_key WHERE status = 'succeeded'` makes a second success a
constraint violation. Partial, because failed and blocked attempts share a key
by design — they are retries of the same operation.

## Atomic claiming and crash recovery

`claim_due_scheduled_posts(claim_token, worker, lease_seconds, limit, now)`
selects due posts `FOR UPDATE SKIP LOCKED` and updates them to `queued` in the
same statement, returning what it claimed. Two workers cannot claim the same
post.

The claim is a triple — token, timestamp, expiry — and a check constraint
requires all three or none.

**Crash recovery.** A claim is only respected until `claim_expires_at`
(10 minutes, matching the task's `maxDuration`). If a worker dies mid-flight,
the lease lapses and the next dispatcher sweep is free to claim the post
again. A lock without an expiry would let one crash strand a post
permanently, which is worse than the duplicate it guards against — and the
duplicate is separately prevented by the idempotency index.

The claim is verified **twice**: once in the gate before sending, and again
before writing an outcome, because the lease can lapse while a provider is
working.

## Publish attempts

`public.publish_attempts` records every attempt, including refusals:
owner, schedule, variant, platform, attempt number, idempotency key, status
(`started` / `succeeded` / `failed` / `blocked` / `cancelled`), provider,
retryability, a safe error code and message, the external id and url, and
timestamps.

**`blocked` is deliberately distinct from `failed`.** A failure is the
provider saying no; a block is this system saying no before anything was sent.
Collapsing them would hide the difference between "the platform rejected it"
and "we would not let it go" — opposite problems.

`(scheduled_post_id, attempt_number)` is unique, so a reused number is a
database error rather than a silently overwritten attempt. There is **no
DELETE policy**: an attempt that happened cannot be removed from the record.

**Never stored:** OAuth tokens, access or refresh tokens, provider secrets,
passwords, raw headers. `sanitiseErrorMessage` redacts bearer tokens, JWTs,
`sb_secret_…`/`tr_…` keys and named credentials **before** truncating, so a
secret cannot survive by sitting past the cut.

## Retry framework

| Retryable               | Not retryable                                                      |
| ----------------------- | ------------------------------------------------------------------ |
| `network`               | `not_approved`, `approval_stale`, `scripture_unverified`           |
| `provider_timeout`      | `missing_asset`, `invalid_content`                                 |
| `provider_rate_limited` | `provider_not_connected`, `provider_permission_revoked`            |
| `provider_unavailable`  | `provider_rejected_media`, `schedule_cancelled`, `schedule_paused` |
|                         | `already_published`, `claim_lost`, `unknown`                       |

**Anything unrecognised is non-retryable.** Guessing that an unfamiliar error
is transient is how a post goes out twice.

No platform-specific retry counts appear anywhere. Those depend on each
platform's published limits, which this codebase will not assert until it has
read them in that platform's current documentation.

## The provider contract

```ts
interface PublishingProvider {
  readonly platform: VariantPlatform;
  isConnected(): Promise<boolean>;
  validateReadiness(request): Promise<ReadinessProblem[]>;
  preparePayload(request): Promise<unknown>;
  publish(request): Promise<PublishResult>;
  reconcile?(idempotencyKey): Promise<PublishSucceeded | null>;
  classifyError(error): SafeError;
}
```

`reconcile` is optional because not every platform lets you look up a post you
may have created — forcing it on all of them would mean writing a fake one.

`PublishResult` has three shapes, not two: `succeeded` (requires a real
external id), `failed`, and **`incomplete`**, for platforms that can only be
driven as far as a draft or that need the owner to finish by hand. Forcing
that into "succeeded" would claim something went live that did not.

`PROVIDER_STATUS` types `available` as `false` rather than `boolean`, so
making a platform available is a deliberate type change the compiler surfaces
everywhere it matters.

## Trigger.dev status, and the one manual step

**No Trigger.dev project is connected.** The task code exists, is type-checked
and is covered by tests; it is not deployed, and this document does not
pretend otherwise.

Connecting requires an interactive login that cannot be automated here:

1. `npx trigger.dev@latest login`
2. Create a project in the Trigger.dev dashboard.
3. Put its reference in `TRIGGER_PROJECT_REF` and its DEV key in
   `TRIGGER_SECRET_KEY` (untracked `.env.local`, and the deployment platform's
   secret store).
4. Set `SUPABASE_SECRET_KEY` in the Trigger.dev environment so the worker can
   reach the database.
5. `npx trigger.dev@latest dev` locally, or `deploy` for production.

Until then: `pnpm build`, `pnpm test` and CI all pass with none of these set,
and `createWorkerClient()` returns `null` with a reason rather than throwing.

## Database

`supabase/migrations/20260809020000_create_publishing_infrastructure.sql`,
applied to `precious-promises-dashboard` (`yrlnahnbwrtmljcbfjdg`).

**Changed:** `scheduled_posts` — the lifecycle check constraint now covers
`queued`, `publishing`, `posted`, `failed` plus the two future states
(`ready_for_manual_post`, `uploaded_to_platform_draft`, named in the database
but kept out of the application's vocabulary); claim and lease columns;
attempt count; timestamps; external post id and url; safe error columns; and
the three check constraints above.

**New:** `publish_attempts`, the `claim_due_scheduled_posts` function, and
eight new audit actions.

RLS on `publish_attempts`: `anon` revoked, owner-scoped SELECT, INSERT proving
the parent schedule belongs to the caller, UPDATE for completing an in-flight
attempt, and **no DELETE policy**. The audit log remains append-only.
`claim_due_scheduled_posts` is `security invoker`, so the caller's own RLS
applies and it cannot reach another owner's rows.

**Security advisor: no lints.**

## Schedule handoff

The Calendar and the Publish Queue share one state machine, in
`src/lib/publishing/lifecycle.ts`. Splitting the owner's moves from the
worker's would let the halves disagree.

- Approval invalidation still pauses an active schedule, and a paused post is
  refused by the gate.
- **Cancelling from the Calendar prevents publishing even if a job already
  exists**, because the worker reloads the status immediately before sending
  and cancellation is checked first.
- Once a provider call is in flight, the post cannot be paused or cancelled —
  only its outcome may follow. Pausing there would abandon a request the
  system had stopped tracking.

## Testing

**561 unit and component tests, 13 Playwright tests.**

New suites: `publishing-safety.test.ts`, `publish-queue.test.tsx`.

Covered: idempotency determinism and per-platform/per-approval distinctness,
the claim contract including expired-lease recovery, every one of the sixteen
gate refusals, ordering of checks, `posted` unreachable by five separate
routes, provider unavailability, retryable and non-retryable classification,
attempt numbering, error sanitisation including redact-before-truncate, queue
grouping and mapping, the absence of an external link when no post exists,
navigation activation, and a source-wide scan asserting no platform host
appears anywhere.

Anonymous Playwright coverage extended to `/dashboard/publish`.

### Deferred: authenticated end-to-end testing

**Still deferred pending the owner Supabase Auth account.** No `auth.users`
rows exist, so the queue's write paths cannot be exercised against live rows.

Verified anonymously: all eleven protected routes redirect to `/login`.

This is a deferral, not a failure.

## Not built in Stage 6

- **Any real external publishing.** Zero posts can be created on any platform.
- YouTube, Instagram and TikTok connections and their OAuth
- A deployed Trigger.dev project
- Live analytics
- Server rendering — Stage 4's adapter is still disconnected
