-- Operator Mode automation controls and run evidence.
--
-- Automation may prepare and move draft work, but it cannot verify Scripture,
-- approve content, or claim publication. Those boundaries remain unchanged.

alter table public.app_settings
  add column if not exists automation_enabled boolean not null default false,
  add column if not exists automation_create_working_drafts boolean not null default true,
  add column if not exists automation_prepare_video_drafts boolean not null default true,
  add column if not exists automation_submit_for_review boolean not null default true,
  add column if not exists automation_last_run_at timestamptz,
  add column if not exists automation_last_error text
    check (automation_last_error is null or char_length(automation_last_error) <= 1000);

comment on column public.app_settings.automation_enabled is
  'Owner-controlled Operator Mode switch. Automation never verifies Scripture, approves content or asserts publication.';
comment on column public.app_settings.automation_create_working_drafts is
  'Allow Operator Mode to create draft scripts and platform variants from already-stored owner content.';
comment on column public.app_settings.automation_prepare_video_drafts is
  'Allow Operator Mode to create draft video projects/scenes that reference verified Scripture and saved script revisions.';
comment on column public.app_settings.automation_submit_for_review is
  'Allow Operator Mode to move completed draft variants to ready_for_review. Human approval still remains mandatory.';

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed', 'disabled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error_detail text
    check (error_detail is null or char_length(error_detail) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.automation_runs is
  'Evidence for each Operator Mode pass. Summary records counts and blockers only; it is not proof of publication.';

create index if not exists automation_runs_owner_started_idx
  on public.automation_runs (owner_id, started_at desc);

alter table public.automation_runs enable row level security;
revoke all on public.automation_runs from anon;

drop policy if exists "Owners can read their automation runs" on public.automation_runs;
create policy "Owners can read their automation runs"
on public.automation_runs for select to authenticated
using ((select auth.uid()) = owner_id);

grant select on table public.automation_runs to authenticated;
grant select, insert, update, delete on table public.automation_runs to service_role;

-- Browser writes are deliberately absent. Scheduled/manual automation uses
-- trusted server credentials, while the owner only reads run evidence.
