-- Stage 10 fix: make the observation upsert reachable, and close a provenance
-- gap in the metrics update policy.
--
-- ---------------------------------------------------------------------------
-- 1. The unique observation guard becomes a plain column list
-- ---------------------------------------------------------------------------
--
-- The guard was a six-term expression index whose sixth term was
-- `((observed_at at time zone 'UTC')::date)`. PostgREST's `on_conflict`
-- parameter can only name real columns, so every upsert named the first five —
-- and Postgres refuses a conflict target that does not exactly match a unique
-- index (42P10). The result: no snapshot could ever be written, API or manual.
--
-- The date term becomes a stored generated column so the index is column-only
-- and the conflict target can name it. The guard itself is unchanged: one
-- snapshot per post, per window, per source, per UTC day.

alter table public.analytics_snapshots
  add column if not exists observed_on_utc date
    generated always as (((observed_at at time zone 'UTC'))::date) stored;

comment on column public.analytics_snapshots.observed_on_utc is
  'The UTC day of observed_at, stored so the unique observation guard is a plain column list that ON CONFLICT can name. Generated — never written directly.';

drop index if exists public.analytics_snapshots_unique_observation;

create unique index if not exists analytics_snapshots_unique_observation
  on public.analytics_snapshots (
    owner_id, platform, external_post_id, source, observation_window,
    observed_on_utc
  );

-- ---------------------------------------------------------------------------
-- 2. A metric row can never be moved onto an API snapshot
-- ---------------------------------------------------------------------------
--
-- The update policy proved the *current* row sat under a manual snapshot but
-- its WITH CHECK proved only ownership of the row being written. An
-- authenticated session could therefore update a metric row's `snapshot_id` to
-- point at an API-sourced snapshot it owns — and a hand-typed number would
-- render as though the platform had reported it. The WITH CHECK now proves the
-- destination snapshot is manual too, exactly as the insert policy does.

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
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.analytics_snapshots s
    where s.id = snapshot_id
      and s.owner_id = (select auth.uid())
      and s.source = 'manual'
  )
);
