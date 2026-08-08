-- Stage 5: approval, scheduling and the audit foundation.
--
-- This migration adds the workflow-control layer. Three things in it are
-- load-bearing and worth reading before the columns:
--
-- 1. **Approval is per platform variant.** Approving the YouTube wording says
--    nothing about Instagram. There is no item-level approval column, so one
--    platform cannot carry another.
--
-- 2. **An approval records a fingerprint of what was approved.** Approval
--    attaches to a specific version of specific wording, not to the row that
--    holds it. `approval_hash` is that version; if the publication-sensitive
--    content changes, the stored hash no longer matches and the approval is
--    void — checked in code, not merely warned about in the interface.
--
-- 3. **Nothing here publishes.** `scheduled_posts` records an intention and a
--    time. No worker reads it, no platform API exists, and the status
--    vocabulary deliberately omits `publishing`, `posted` and `failed` so the
--    interface cannot claim an outcome no system produced.

-- ---------------------------------------------------------------------------
-- platform_variants: real approval state
-- ---------------------------------------------------------------------------

-- Stage 3 allowed draft and ready_for_review only. Approval now exists, so the
-- vocabulary grows — and only now, because the states are real.
alter table public.platform_variants
  drop constraint if exists platform_variants_review_state_check;

alter table public.platform_variants
  add constraint platform_variants_review_state_check
  check (review_state in ('draft', 'ready_for_review', 'approved', 'rejected'));

alter table public.platform_variants
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approval_hash text
    check (approval_hash is null or char_length(approval_hash) = 64),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users (id) on delete set null,
  add column if not exists rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 2000);

-- An approved variant must say what was approved and when. Without the hash
-- there is nothing to compare against later, and the approval would decay into
-- an unfalsifiable claim.
alter table public.platform_variants
  drop constraint if exists platform_variants_approved_requires_metadata;
alter table public.platform_variants
  add constraint platform_variants_approved_requires_metadata check (
    (review_state = 'approved'
      and approved_at is not null
      and approved_by is not null
      and approval_hash is not null)
    or (review_state <> 'approved'
      and approved_at is null
      and approved_by is null
      and approval_hash is null)
  );

-- A rejection must carry a reason. "Rejected" with no explanation is not
-- reviewable, and the owner would have to guess what to change.
alter table public.platform_variants
  drop constraint if exists platform_variants_rejected_requires_reason;
alter table public.platform_variants
  add constraint platform_variants_rejected_requires_reason check (
    (review_state = 'rejected'
      and rejected_at is not null
      and rejected_by is not null
      and rejection_reason is not null)
    or (review_state <> 'rejected'
      and rejected_at is null
      and rejected_by is null
      and rejection_reason is null)
  );

comment on column public.platform_variants.approval_hash is
  'SHA-256 fingerprint of the publication-sensitive content at the moment of approval. A mismatch means the approval no longer describes what is stored.';
comment on column public.platform_variants.review_state is
  'draft | ready_for_review | approved | rejected. Per platform variant — approving one platform never approves another. Approval publishes nothing.';

-- ---------------------------------------------------------------------------
-- scheduled_posts
-- ---------------------------------------------------------------------------
--
-- A time an approved variant is intended to go out. **Nothing executes this.**

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform_variant_id uuid not null
    references public.platform_variants (id) on delete cascade,

  -- Always UTC. The owner's chosen zone is stored beside it rather than baked
  -- into the instant, so a daylight-saving change cannot silently move a post.
  scheduled_for timestamptz not null,
  timezone text not null default 'Europe/London'
    check (char_length(timezone) between 1 and 64),

  -- `publishing`, `posted` and `failed` are deliberately absent: no worker,
  -- no platform API, and a status the system cannot honour would be a lie the
  -- interface tells on its behalf.
  status text not null default 'scheduled'
    check (status in ('scheduled', 'paused', 'cancelled')),

  -- The fingerprint this schedule was created against. Compared before the
  -- schedule may be considered eligible.
  approval_hash text not null check (char_length(approval_hash) = 64),

  recurring_rule_id uuid,

  paused_at timestamptz,
  pause_reason text check (pause_reason is null or char_length(pause_reason) <= 2000),
  cancelled_at timestamptz,
  cancellation_reason text
    check (cancellation_reason is null or char_length(cancellation_reason) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Every departure from `scheduled` carries a reason, so the calendar can
  -- always say *why* something is not going out.
  constraint scheduled_posts_paused_requires_reason check (
    (status = 'paused' and paused_at is not null and pause_reason is not null)
    or (status <> 'paused' and paused_at is null and pause_reason is null)
  ),
  constraint scheduled_posts_cancelled_requires_reason check (
    (status = 'cancelled' and cancelled_at is not null and cancellation_reason is not null)
    or (status <> 'cancelled' and cancelled_at is null and cancellation_reason is null)
  )
);

comment on table public.scheduled_posts is
  'An intended publish time for an approved platform variant. Nothing executes these — no worker and no platform integration exist.';
comment on column public.scheduled_posts.scheduled_for is
  'Stored in UTC. The timezone column records the zone the owner chose, for display and for recomputation.';
comment on column public.scheduled_posts.approval_hash is
  'The approval fingerprint this schedule was created against. A schedule whose hash no longer matches the variant is not eligible.';

create index if not exists scheduled_posts_owner_time_idx
  on public.scheduled_posts (owner_id, scheduled_for);
create index if not exists scheduled_posts_variant_idx
  on public.scheduled_posts (platform_variant_id);

drop trigger if exists scheduled_posts_set_updated_at on public.scheduled_posts;
create trigger scheduled_posts_set_updated_at
before update on public.scheduled_posts
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- recurring_schedule_rules
-- ---------------------------------------------------------------------------
--
-- A rule defines a **slot**, not permission to publish. It never creates a
-- scheduled post on its own and never selects content. Approved content is
-- assigned into a slot by a human.

create table if not exists public.recurring_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(trim(name)) between 1 and 120),

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),
  content_type text,

  -- 0 = Sunday, matching JavaScript's getDay().
  day_of_week integer not null check (day_of_week between 0 and 6),
  local_time time not null,
  timezone text not null default 'Europe/London'
    check (char_length(timezone) between 1 and 64),

  -- Off until the owner turns it on. A rule that activated itself would be a
  -- schedule nobody agreed to.
  enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, name)
);

comment on table public.recurring_schedule_rules is
  'A recurring slot in the week. Defines when something could go out, never what goes out, and never creates a scheduled post by itself.';
comment on column public.recurring_schedule_rules.enabled is
  'Disabled by default. A rule the owner has not enabled has no effect anywhere.';

create index if not exists recurring_schedule_rules_owner_idx
  on public.recurring_schedule_rules (owner_id, day_of_week, local_time);

drop trigger if exists recurring_schedule_rules_set_updated_at on public.recurring_schedule_rules;
create trigger recurring_schedule_rules_set_updated_at
before update on public.recurring_schedule_rules
for each row execute function public.handle_updated_at();

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_recurring_rule_id_fkey;
alter table public.scheduled_posts
  add constraint scheduled_posts_recurring_rule_id_fkey
  foreign key (recurring_rule_id)
  references public.recurring_schedule_rules (id) on delete set null;

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
--
-- Append-only record of workflow actions. Enforced by RLS: there is a SELECT
-- policy and an INSERT policy, and deliberately no UPDATE or DELETE policy, so
-- a recorded action cannot be rewritten or removed by the application.
--
-- Never holds secrets. Metadata is descriptive only — ids, states, reasons.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  action text not null check (
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
      'recurring_rule_updated'
    )
  ),

  entity_type text not null check (
    entity_type in ('platform_variant', 'scheduled_post', 'recurring_schedule_rule')
  ),
  entity_id uuid not null,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only record of workflow actions. No UPDATE or DELETE policy exists, so entries cannot be rewritten. Never stores secrets.';

create index if not exists audit_log_owner_time_idx
  on public.audit_log (owner_id, created_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.scheduled_posts enable row level security;
alter table public.recurring_schedule_rules enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.scheduled_posts from anon;
revoke all on public.recurring_schedule_rules from anon;
revoke all on public.audit_log from anon;

-- scheduled_posts -----------------------------------------------------------
--
-- Writes prove the platform variant belongs to the same caller, so a schedule
-- cannot be attached to somebody else's approved wording.

drop policy if exists "Owners can read their scheduled posts" on public.scheduled_posts;
create policy "Owners can read their scheduled posts"
on public.scheduled_posts for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their scheduled posts" on public.scheduled_posts;
create policy "Owners can create their scheduled posts"
on public.scheduled_posts for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their scheduled posts" on public.scheduled_posts;
create policy "Owners can update their scheduled posts"
on public.scheduled_posts for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their scheduled posts" on public.scheduled_posts;
create policy "Owners can delete their scheduled posts"
on public.scheduled_posts for delete to authenticated
using ((select auth.uid()) = owner_id);

-- recurring_schedule_rules --------------------------------------------------

drop policy if exists "Owners can read their recurring rules" on public.recurring_schedule_rules;
create policy "Owners can read their recurring rules"
on public.recurring_schedule_rules for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their recurring rules" on public.recurring_schedule_rules;
create policy "Owners can create their recurring rules"
on public.recurring_schedule_rules for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their recurring rules" on public.recurring_schedule_rules;
create policy "Owners can update their recurring rules"
on public.recurring_schedule_rules for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their recurring rules" on public.recurring_schedule_rules;
create policy "Owners can delete their recurring rules"
on public.recurring_schedule_rules for delete to authenticated
using ((select auth.uid()) = owner_id);

-- audit_log -----------------------------------------------------------------
--
-- SELECT and INSERT only. The absence of UPDATE and DELETE policies is the
-- append-only guarantee: with RLS enabled and no policy, those operations are
-- refused for every row.

drop policy if exists "Owners can read their audit log" on public.audit_log;
create policy "Owners can read their audit log"
on public.audit_log for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can append to their audit log" on public.audit_log;
create policy "Owners can append to their audit log"
on public.audit_log for insert to authenticated
with check ((select auth.uid()) = owner_id);
