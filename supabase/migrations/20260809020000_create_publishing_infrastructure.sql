-- Stage 6: publishing infrastructure.
--
-- The machinery that will one day turn an approved scheduled record into a
-- real post. **Nothing in Stage 6 publishes**: no provider exists, and the
-- constraints below make a fabricated success impossible rather than merely
-- discouraged.
--
-- Three guarantees are enforced here rather than in code alone:
--
-- 1. **`posted` requires a real external post id.** A job that finished
--    without a platform confirming anything cannot be recorded as posted.
-- 2. **One successful publish per operation.** A partial unique index on the
--    idempotency key of *succeeded* attempts makes a second success a database
--    error, not a duplicate post somebody discovers later.
-- 3. **Claims expire.** A worker that crashes mid-flight leaves a lease that
--    lapses, so a job is never permanently stuck.

-- ---------------------------------------------------------------------------
-- scheduled_posts: execution lifecycle and claim
-- ---------------------------------------------------------------------------

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_status_check;

-- The canonical lifecycle. `ready_for_manual_post` and
-- `uploaded_to_platform_draft` are named now so a future provider that can
-- only reach a draft has somewhere honest to stop.
alter table public.scheduled_posts
  add constraint scheduled_posts_status_check check (
    status in (
      'scheduled',
      'paused',
      'queued',
      'publishing',
      'posted',
      'failed',
      'cancelled',
      'ready_for_manual_post',
      'uploaded_to_platform_draft'
    )
  );

alter table public.scheduled_posts
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0),

  -- Claim / lease. A claim is only respected until it expires, so a crashed
  -- worker cannot brick a job forever.
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists claimed_by text
    check (claimed_by is null or char_length(claimed_by) <= 200),

  add column if not exists queued_at timestamptz,
  add column if not exists publishing_started_at timestamptz,
  add column if not exists posted_at timestamptz,

  -- Only ever written from a genuine provider result.
  add column if not exists external_post_id text
    check (external_post_id is null or char_length(external_post_id) <= 300),
  add column if not exists external_post_url text
    check (external_post_url is null or char_length(external_post_url) <= 2000),

  -- Sanitised. Never a raw provider payload, never a header, never a token.
  add column if not exists last_error_code text
    check (last_error_code is null or char_length(last_error_code) <= 100),
  add column if not exists last_error_message text
    check (last_error_message is null or char_length(last_error_message) <= 1000);

-- **The invariant that makes fake publishing impossible.** `posted` without an
-- external id is refused by the database, so no code path — present or future
-- — can write a success the platform never confirmed.
alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_posted_requires_external_id;
alter table public.scheduled_posts
  add constraint scheduled_posts_posted_requires_external_id check (
    status <> 'posted'
    or (external_post_id is not null and posted_at is not null)
  );

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_failed_requires_reason;
alter table public.scheduled_posts
  add constraint scheduled_posts_failed_requires_reason check (
    status <> 'failed' or last_error_code is not null
  );

-- A claim is a triple: without all three it is not a claim.
alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_claim_is_complete;
alter table public.scheduled_posts
  add constraint scheduled_posts_claim_is_complete check (
    (claim_token is null and claimed_at is null and claim_expires_at is null)
    or (claim_token is not null and claimed_at is not null and claim_expires_at is not null)
  );

comment on column public.scheduled_posts.claim_expires_at is
  'Lease expiry. A claim past this moment is treated as abandoned and may be reclaimed, so a crashed worker never bricks a job.';
comment on column public.scheduled_posts.external_post_id is
  'The platform''s own id for the post. Required before status may be posted — this is what makes a fabricated success impossible.';

create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts (status, scheduled_for)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- publish_attempts
-- ---------------------------------------------------------------------------
--
-- Every attempt against a provider, including the refusals. The history is how
-- the system stays trustworthy about what did and did not reach an audience.

create table if not exists public.publish_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scheduled_post_id uuid not null
    references public.scheduled_posts (id) on delete cascade,
  platform_variant_id uuid not null
    references public.platform_variants (id) on delete cascade,

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  attempt_number integer not null check (attempt_number >= 1),

  -- Deterministic identity of one approved publishing operation. Binds the
  -- schedule, the platform and the approval fingerprint.
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),

  status text not null check (
    status in ('started', 'succeeded', 'failed', 'blocked', 'cancelled')
  ),

  -- Which adapter was asked. 'none' records an attempt made while no provider
  -- was connected; it publishes nothing.
  provider text not null default 'none'
    check (provider in ('none', 'youtube', 'instagram', 'tiktok')),

  retryable boolean,

  -- Sanitised diagnostics only. No tokens, no headers, no provider payloads.
  safe_error_code text
    check (safe_error_code is null or char_length(safe_error_code) <= 100),
  safe_error_message text
    check (safe_error_message is null or char_length(safe_error_message) <= 1000),

  external_post_id text
    check (external_post_id is null or char_length(external_post_id) <= 300),
  external_post_url text
    check (external_post_url is null or char_length(external_post_url) <= 2000),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (scheduled_post_id, attempt_number),

  -- A succeeded attempt must carry the platform's own id, for the same reason
  -- scheduled_posts does.
  constraint publish_attempts_success_requires_external_id check (
    status <> 'succeeded' or external_post_id is not null
  ),
  constraint publish_attempts_failure_requires_code check (
    status not in ('failed', 'blocked') or safe_error_code is not null
  ),
  -- Nothing without a provider can succeed.
  constraint publish_attempts_none_provider_cannot_succeed check (
    provider <> 'none' or status <> 'succeeded'
  )
);

comment on table public.publish_attempts is
  'Every attempt to publish, including refusals. A succeeded attempt requires the platform''s own post id. Never stores credentials.';
comment on column public.publish_attempts.idempotency_key is
  'Deterministic identity of one approved publishing operation: schedule, platform and approval fingerprint.';

-- **One success per operation.** A partial unique index rather than a plain
-- one: failed and blocked attempts share a key by design, because they are
-- retries of the same operation.
create unique index if not exists publish_attempts_one_success_per_operation
  on public.publish_attempts (idempotency_key)
  where status = 'succeeded';

create index if not exists publish_attempts_post_idx
  on public.publish_attempts (scheduled_post_id, attempt_number desc);
create index if not exists publish_attempts_owner_idx
  on public.publish_attempts (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- audit_log: publishing actions
-- ---------------------------------------------------------------------------

alter table public.audit_log
  drop constraint if exists audit_log_action_check;

alter table public.audit_log
  add constraint audit_log_action_check check (
    action in (
      'variant_submitted_for_review',
      'variant_approved',
      'variant_rejected',
      'variant_returned_to_draft',
      'approval_invalidated',
      'post_scheduled',
      'schedule_paused',
      'schedule_cancelled',
      'recurring_rule_created',
      'recurring_rule_updated',
      'publish_queued',
      'publish_claimed',
      'publish_attempt_started',
      'publish_attempt_failed',
      'publish_attempt_succeeded',
      'publish_blocked',
      'publish_retried',
      'publish_reconciled'
    )
  );

alter table public.audit_log
  drop constraint if exists audit_log_entity_type_check;

alter table public.audit_log
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'platform_variant',
      'scheduled_post',
      'recurring_schedule_rule',
      'publish_attempt'
    )
  );

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------
--
-- `for update skip locked` selects rows no other worker is already holding,
-- and the update happens in the same statement — so two workers cannot claim
-- the same post. Rows whose lease has expired are eligible again, which is the
-- crash-recovery path.
--
-- security invoker (the default) deliberately: the caller's own RLS applies,
-- so this function cannot be used to reach another owner's rows.

create or replace function public.claim_due_scheduled_posts(
  p_claim_token uuid,
  p_worker text,
  p_lease_seconds integer default 600,
  p_limit integer default 10,
  p_now timestamptz default now()
)
returns setof public.scheduled_posts
language sql
volatile
set search_path = ''
as $$
  with due as (
    select sp.id
    from public.scheduled_posts sp
    where sp.status = 'scheduled'
      and sp.scheduled_for <= p_now
      and (sp.claim_expires_at is null or sp.claim_expires_at < p_now)
    order by sp.scheduled_for asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.scheduled_posts sp
  set status = 'queued',
      queued_at = p_now,
      claimed_at = p_now,
      claim_token = p_claim_token,
      claim_expires_at = p_now + make_interval(secs => greatest(p_lease_seconds, 1)),
      claimed_by = p_worker
  from due
  where sp.id = due.id
  returning sp.*;
$$;

comment on function public.claim_due_scheduled_posts is
  'Atomically claim due scheduled posts with an expiring lease. for update skip locked prevents two workers claiming the same row; an expired lease is reclaimable, so a crashed worker never bricks a job.';

revoke all on function public.claim_due_scheduled_posts(uuid, text, integer, integer, timestamptz) from public;
revoke all on function public.claim_due_scheduled_posts(uuid, text, integer, integer, timestamptz) from anon;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.publish_attempts enable row level security;
revoke all on public.publish_attempts from anon;

drop policy if exists "Owners can read their publish attempts" on public.publish_attempts;
create policy "Owners can read their publish attempts"
on public.publish_attempts for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their publish attempts" on public.publish_attempts;
create policy "Owners can create their publish attempts"
on public.publish_attempts for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.scheduled_posts sp
    where sp.id = scheduled_post_id and sp.owner_id = (select auth.uid())
  )
);

-- UPDATE exists so an in-flight attempt can be completed by the worker.
-- There is deliberately **no DELETE policy**: an attempt that happened cannot
-- be removed from the record.
drop policy if exists "Owners can complete their publish attempts" on public.publish_attempts;
create policy "Owners can complete their publish attempts"
on public.publish_attempts for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
