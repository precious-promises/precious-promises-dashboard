-- Stage 10: Analytics & Growth Centre.
--
-- The measurement layer. One rule shapes every table here:
--
--   **Zero is a measurement. Absence is not.**
--
-- A missing row means nobody has asked the platform yet, or the platform
-- refused, or no account is connected. None of those is "0 views", and this
-- schema is built so the difference survives all the way to the screen: a
-- metric that was never observed has no row, and a metric genuinely observed as
-- zero has a row whose value is 0.
--
-- The second rule: **every number carries its provenance.** A value with no
-- source, no observation time and no external post id is a number nobody can
-- check, and an unauditable number in a growth dashboard is worse than none.

-- ---------------------------------------------------------------------------
-- analytics_snapshots
-- ---------------------------------------------------------------------------
--
-- One observation of one post, at one moment, from one source.
--
-- Snapshots are **append-only in spirit**: today's fetch never overwrites
-- yesterday's, because "how did it do in its first 24 hours" and "how is it
-- doing now" are different questions and both matter. The unique constraint
-- prevents an accidental duplicate of the same window on the same day without
-- preventing the series itself.

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  -- Where this observation came from. `manual` is a first-class citizen and is
  -- never silently mixed with API data: every surface that shows a number can
  -- say which of these produced it.
  source text not null check (
    source in ('youtube_api', 'instagram_api', 'tiktok_api', 'manual')
  ),

  -- The platform's own identifier for the post. This is the canonical join —
  -- never a title, never a caption, both of which change and collide.
  external_post_id text not null
    check (char_length(external_post_id) between 1 and 300),

  -- Bound back to this system's records where possible. Nullable because a
  -- post may predate the dashboard, or have been published by hand.
  social_account_id uuid references public.social_accounts (id) on delete set null,
  scheduled_post_id uuid references public.scheduled_posts (id) on delete set null,
  platform_variant_id uuid references public.platform_variants (id) on delete set null,
  content_item_id uuid references public.content_items (id) on delete set null,

  -- Which question this observation answers. `lifetime` is cumulative-to-date;
  -- the others are the standard early windows.
  observation_window text not null check (
    observation_window in ('first_24h', 'first_7d', 'first_28d', 'lifetime')
  ),

  -- The period the metrics describe, for windowed reports. Null for a
  -- lifetime-to-date reading, which has no meaningful start.
  period_start date,
  period_end date,

  -- When the platform says the data describes, and when we actually asked.
  -- These differ: platforms lag, and a figure fetched today may describe
  -- yesterday. Both are shown rather than collapsed.
  observed_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

comment on table public.analytics_snapshots is
  'One observation of one post at one moment from one source. Append-oriented: today never overwrites yesterday. A missing row means "not observed", which is not zero.';

-- One snapshot per post, per window, per source, per day. Re-running a sync on
-- the same day updates in place rather than accumulating noise; running it
-- tomorrow creates the next point in the series.
--
-- A unique *index* rather than a table constraint: Postgres allows an
-- expression in one and not the other, and the date has to be pinned to UTC
-- explicitly — `::date` alone would use the session timezone, so the same
-- instant could land on different days for different callers and the guard
-- would quietly stop guarding.
create unique index if not exists analytics_snapshots_unique_observation
  on public.analytics_snapshots (
    owner_id, platform, external_post_id, source, observation_window,
    ((observed_at at time zone 'UTC')::date)
  );

create index if not exists analytics_snapshots_owner_platform_idx
  on public.analytics_snapshots (owner_id, platform, observed_at desc);
create index if not exists analytics_snapshots_external_idx
  on public.analytics_snapshots (owner_id, platform, external_post_id);
create index if not exists analytics_snapshots_content_idx
  on public.analytics_snapshots (owner_id, content_item_id);
create index if not exists analytics_snapshots_post_idx
  on public.analytics_snapshots (scheduled_post_id);
create index if not exists analytics_snapshots_window_idx
  on public.analytics_snapshots (owner_id, observation_window, observed_at desc);

-- ---------------------------------------------------------------------------
-- analytics_metrics
-- ---------------------------------------------------------------------------
--
-- The values themselves, normalised one row per metric.
--
-- Normalised rather than a wide table on purpose: platforms add, rename and
-- retire metrics constantly — Meta replaced `impressions` with `views` in 2025
-- — and a schema with a column per platform metric would need a migration
-- every time. It would also make "this platform does not report that" and
-- "that metric was zero" the same NULL, which is precisely the confusion this
-- stage exists to prevent.

create table if not exists public.analytics_metrics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  snapshot_id uuid not null
    references public.analytics_snapshots (id) on delete cascade,

  -- This system's canonical name. Comparable across platforms only where the
  -- normalisation is mathematically defensible — see docs/stage-10.
  metric_name text not null check (char_length(metric_name) between 1 and 80),

  -- **The platform's own name for it**, kept verbatim. This is what makes a
  -- normalised figure auditable: `views_or_plays` on a YouTube row came from
  -- `views`, and on an Instagram row from `views` meaning something subtly
  -- different. Erasing this would be erasing the ability to check.
  raw_metric_name text not null
    check (char_length(raw_metric_name) between 1 and 120),

  metric_value numeric not null,

  -- What the number is. A count and a duration in seconds must never be summed
  -- together by a chart that forgot to check.
  metric_unit text not null check (
    metric_unit in ('count', 'seconds', 'percent', 'ratio')
  ),

  created_at timestamptz not null default now(),

  constraint analytics_metrics_unique_per_snapshot unique (snapshot_id, metric_name)
);

comment on table public.analytics_metrics is
  'One metric value per row. raw_metric_name preserves the platform''s own name so a normalised figure stays auditable.';

create index if not exists analytics_metrics_snapshot_idx
  on public.analytics_metrics (snapshot_id);
create index if not exists analytics_metrics_name_idx
  on public.analytics_metrics (owner_id, metric_name);

-- ---------------------------------------------------------------------------
-- analytics_sync_runs  (server-only)
-- ---------------------------------------------------------------------------
--
-- Every attempt to fetch, including the failures.
--
-- This is what lets the interface say "last successful sync: Tuesday; latest
-- refresh failed" instead of blanking the numbers. **A failed fetch never
-- deletes a good snapshot** — it writes a row here and leaves the data alone.

create table if not exists public.analytics_sync_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  -- Who asked. A manual refresh from the dashboard and a scheduled job are
  -- different events and the owner can tell them apart.
  trigger_source text not null default 'scheduled'
    check (trigger_source in ('scheduled', 'manual')),

  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),

  -- Classified the same way publishing errors are, but kept separate: an
  -- analytics failure must never touch a publish record.
  error_category text
    check (error_category is null or char_length(error_category) <= 60),
  error_detail text
    check (error_detail is null or char_length(error_detail) <= 1000),

  snapshots_written integer not null default 0 check (snapshots_written >= 0),
  posts_considered integer not null default 0 check (posts_considered >= 0),

  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.analytics_sync_runs is
  'Every analytics fetch attempt, including failures. RLS enabled with a read policy only: the browser may see sync history but can never manufacture one.';

create index if not exists analytics_sync_runs_owner_platform_idx
  on public.analytics_sync_runs (owner_id, platform, started_at desc);

-- ---------------------------------------------------------------------------
-- growth_goals
-- ---------------------------------------------------------------------------
--
-- Targets Dave sets. **Never a forecast**, and stored apart from measurements
-- so no chart can accidentally plot an intention as an observation.

create table if not exists public.growth_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(name) between 1 and 200),

  metric text not null check (
    metric in (
      'posts_published',
      'views_or_plays',
      'watch_time_seconds',
      'engagements',
      'followers_gained'
    )
  ),

  -- Null means "across everything", which is a real choice rather than a gap.
  platform text check (platform is null or platform in ('youtube', 'instagram', 'tiktok')),

  target_value numeric not null check (target_value > 0),
  period_start date not null,
  period_end date not null,

  status text not null default 'active'
    check (status in ('active', 'achieved', 'missed', 'abandoned')),

  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint growth_goals_period_ordered check (period_end >= period_start)
);

comment on table public.growth_goals is
  'Owner-set targets. A goal is an intention, never a prediction, and is stored apart from measured metrics.';

drop trigger if exists growth_goals_set_updated_at on public.growth_goals;
create trigger growth_goals_set_updated_at
before update on public.growth_goals
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- growth_experiments
-- ---------------------------------------------------------------------------
--
-- Observational experiments, and the name matters. These platforms do not
-- offer random simultaneous assignment, so this is **not** A/B testing and the
-- schema refuses to pretend: a conclusion is a field the owner writes, not one
-- the system computes and declares.

create table if not exists public.growth_experiments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(name) between 1 and 200),
  hypothesis text not null check (char_length(hypothesis) between 1 and 2000),

  -- What is being varied. Everything else is meant to stay the same, which on
  -- a real content schedule it never quite does — hence "observational".
  dimension text not null check (
    dimension in (
      'title_style',
      'thumbnail_text',
      'content_length',
      'posting_time',
      'cta',
      'topic',
      'format'
    )
  ),

  status text not null default 'planned'
    check (status in ('planned', 'running', 'observed', 'inconclusive', 'abandoned')),

  started_on date,
  ended_on date,

  -- What the owner concluded, in their own words. Deliberately free text and
  -- deliberately owner-written: nothing here auto-declares a winner.
  observation text check (observation is null or char_length(observation) <= 4000),
  notes text check (notes is null or char_length(notes) <= 4000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint growth_experiments_dates_ordered check (
    ended_on is null or started_on is null or ended_on >= started_on
  ),
  -- An experiment cannot be observed before it ran.
  constraint growth_experiments_observed_needs_start check (
    status not in ('observed', 'inconclusive') or started_on is not null
  )
);

comment on table public.growth_experiments is
  'Observational content experiments. Not A/B tests: these platforms offer no random simultaneous assignment, and no result is ever auto-declared conclusive.';

drop trigger if exists growth_experiments_set_updated_at on public.growth_experiments;
create trigger growth_experiments_set_updated_at
before update on public.growth_experiments
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Membership of an experiment
-- ---------------------------------------------------------------------------

create table if not exists public.growth_experiment_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  experiment_id uuid not null
    references public.growth_experiments (id) on delete cascade,
  scheduled_post_id uuid not null
    references public.scheduled_posts (id) on delete cascade,

  -- Which side of the comparison. Named arms rather than "A/B" so the label
  -- describes the content rather than implying an assignment that never
  -- happened.
  arm text not null check (char_length(arm) between 1 and 60),

  created_at timestamptz not null default now(),

  constraint growth_experiment_posts_unique unique (experiment_id, scheduled_post_id)
);

create index if not exists growth_experiment_posts_experiment_idx
  on public.growth_experiment_posts (experiment_id);

-- ---------------------------------------------------------------------------
-- External availability of a published post
-- ---------------------------------------------------------------------------
--
-- A post can be deleted at the platform. When that happens its **history is
-- not erased** — it genuinely was published, and the snapshots genuinely were
-- observed. Only its current reachability changes.

alter table public.scheduled_posts
  add column if not exists external_availability text;

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_external_availability_check;
alter table public.scheduled_posts
  add constraint scheduled_posts_external_availability_check check (
    external_availability is null
    or external_availability in ('available', 'unavailable', 'unknown')
  );

alter table public.scheduled_posts
  add column if not exists external_checked_at timestamptz;

comment on column public.scheduled_posts.external_availability is
  'Whether the published post can still be found at the platform. Never rewrites the fact that it was posted, and never clears external_post_id.';

-- ---------------------------------------------------------------------------
-- audit_log: analytics and growth actions
-- ---------------------------------------------------------------------------

alter table public.audit_log drop constraint if exists audit_log_action_check;

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
      'publish_reconciled',
      'youtube_connected',
      'youtube_reconnected',
      'youtube_disconnected',
      'youtube_upload_started',
      'youtube_upload_completed',
      'youtube_upload_failed',
      'youtube_thumbnail_set',
      'youtube_playlist_added',
      'youtube_processing_updated',
      'drive_connected',
      'drive_disconnected',
      'drive_asset_imported',
      'drive_asset_rejected',
      'instagram_connected',
      'instagram_reconnected',
      'instagram_disconnected',
      'instagram_container_created',
      'instagram_container_finished',
      'instagram_published',
      'instagram_publish_failed',
      'tiktok_connected',
      'tiktok_reconnected',
      'tiktok_disconnected',
      'tiktok_upload_started',
      'tiktok_upload_completed',
      'tiktok_processing_updated',
      'tiktok_post_completed',
      'tiktok_post_failed',
      'tiktok_uploaded_to_draft',
      'tiktok_manual_post_prepared',
      -- Stage 10. No provider payloads, no tokens, no metric values that would
      -- turn the audit log into a second and diverging copy of the data.
      'analytics_sync_started',
      'analytics_sync_completed',
      'analytics_sync_failed',
      'analytics_permission_required',
      'analytics_manual_entry_recorded',
      'growth_goal_created',
      'growth_goal_updated',
      'growth_experiment_created',
      'growth_experiment_completed'
    )
  );

alter table public.audit_log drop constraint if exists audit_log_entity_type_check;

alter table public.audit_log
  add constraint audit_log_entity_type_check check (
    entity_type in (
      'platform_variant',
      'scheduled_post',
      'recurring_schedule_rule',
      'publish_attempt',
      'social_account',
      'media_asset',
      'analytics_sync_run',
      'growth_goal',
      'growth_experiment'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.analytics_snapshots enable row level security;
alter table public.analytics_metrics enable row level security;
alter table public.analytics_sync_runs enable row level security;
alter table public.growth_goals enable row level security;
alter table public.growth_experiments enable row level security;
alter table public.growth_experiment_posts enable row level security;

revoke all on public.analytics_snapshots from anon;
revoke all on public.analytics_metrics from anon;
revoke all on public.analytics_sync_runs from anon;
revoke all on public.growth_goals from anon;
revoke all on public.growth_experiments from anon;
revoke all on public.growth_experiment_posts from anon;

-- analytics_snapshots ---------------------------------------------------------
--
-- **Read-only from the browser, with one exception.** API-sourced analytics are
-- written by the worker alone: a browser that could insert an
-- `instagram_api` snapshot could manufacture performance data and have it
-- render as though Meta had reported it. The owner may insert only `manual`
-- rows, and the policy — not a convention — is what enforces that.

drop policy if exists "Owners can read their analytics snapshots" on public.analytics_snapshots;
create policy "Owners can read their analytics snapshots"
on public.analytics_snapshots for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can record manual analytics only" on public.analytics_snapshots;
create policy "Owners can record manual analytics only"
on public.analytics_snapshots for insert to authenticated
with check ((select auth.uid()) = owner_id and source = 'manual');

drop policy if exists "Owners can update their manual analytics only" on public.analytics_snapshots;
create policy "Owners can update their manual analytics only"
on public.analytics_snapshots for update to authenticated
using ((select auth.uid()) = owner_id and source = 'manual')
with check ((select auth.uid()) = owner_id and source = 'manual');

drop policy if exists "Owners can delete their manual analytics only" on public.analytics_snapshots;
create policy "Owners can delete their manual analytics only"
on public.analytics_snapshots for delete to authenticated
using ((select auth.uid()) = owner_id and source = 'manual');

-- analytics_metrics -----------------------------------------------------------
--
-- The same rule, enforced through the parent snapshot: a metric may only be
-- written against a snapshot the owner owns **and** which is manual.

drop policy if exists "Owners can read their analytics metrics" on public.analytics_metrics;
create policy "Owners can read their analytics metrics"
on public.analytics_metrics for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can record metrics on manual snapshots" on public.analytics_metrics;
create policy "Owners can record metrics on manual snapshots"
on public.analytics_metrics for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.analytics_snapshots s
    where s.id = snapshot_id
      and s.owner_id = (select auth.uid())
      and s.source = 'manual'
  )
);

drop policy if exists "Owners can update metrics on manual snapshots" on public.analytics_metrics;
create policy "Owners can update metrics on manual snapshots"
on public.analytics_metrics for update to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.analytics_snapshots s
    where s.id = snapshot_id
      and s.owner_id = (select auth.uid())
      and s.source = 'manual'
  )
)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete metrics on manual snapshots" on public.analytics_metrics;
create policy "Owners can delete metrics on manual snapshots"
on public.analytics_metrics for delete to authenticated
using (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.analytics_snapshots s
    where s.id = snapshot_id
      and s.owner_id = (select auth.uid())
      and s.source = 'manual'
  )
);

-- analytics_sync_runs ---------------------------------------------------------
--
-- Readable so the interface can show freshness and the last failure. **No
-- write policy at all**: a browser that could write a succeeded run could make
-- stale data look fresh, which is the one lie this whole stage exists to
-- prevent.

drop policy if exists "Owners can read their sync runs" on public.analytics_sync_runs;
create policy "Owners can read their sync runs"
on public.analytics_sync_runs for select to authenticated
using ((select auth.uid()) = owner_id);

-- growth_goals ----------------------------------------------------------------

drop policy if exists "Owners can read their goals" on public.growth_goals;
create policy "Owners can read their goals"
on public.growth_goals for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their goals" on public.growth_goals;
create policy "Owners can create their goals"
on public.growth_goals for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their goals" on public.growth_goals;
create policy "Owners can update their goals"
on public.growth_goals for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their goals" on public.growth_goals;
create policy "Owners can delete their goals"
on public.growth_goals for delete to authenticated
using ((select auth.uid()) = owner_id);

-- growth_experiments ----------------------------------------------------------

drop policy if exists "Owners can read their experiments" on public.growth_experiments;
create policy "Owners can read their experiments"
on public.growth_experiments for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their experiments" on public.growth_experiments;
create policy "Owners can create their experiments"
on public.growth_experiments for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their experiments" on public.growth_experiments;
create policy "Owners can update their experiments"
on public.growth_experiments for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their experiments" on public.growth_experiments;
create policy "Owners can delete their experiments"
on public.growth_experiments for delete to authenticated
using ((select auth.uid()) = owner_id);

-- growth_experiment_posts -----------------------------------------------------
--
-- Ownership of the parent experiment **and** of the post is proved on write,
-- the same rule every child table in this schema follows.

drop policy if exists "Owners can read their experiment posts" on public.growth_experiment_posts;
create policy "Owners can read their experiment posts"
on public.growth_experiment_posts for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can add posts to their experiments" on public.growth_experiment_posts;
create policy "Owners can add posts to their experiments"
on public.growth_experiment_posts for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.growth_experiments e
    where e.id = experiment_id and e.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.scheduled_posts p
    where p.id = scheduled_post_id and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can remove posts from their experiments" on public.growth_experiment_posts;
create policy "Owners can remove posts from their experiments"
on public.growth_experiment_posts for delete to authenticated
using ((select auth.uid()) = owner_id);
