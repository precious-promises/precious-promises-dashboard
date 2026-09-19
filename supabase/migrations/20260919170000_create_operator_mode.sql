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


-- AI drafts that Operator Mode applies to a working artifact are still not
-- human-approved. "prepared" records that distinction explicitly.
alter table public.ai_generations drop constraint if exists ai_generations_status_check;
alter table public.ai_generations
  add constraint ai_generations_status_check check (
    status in ('drafted', 'prepared', 'accepted', 'rejected')
  );

alter table public.ai_generations drop constraint if exists ai_generations_accepted_requires_target;
alter table public.ai_generations
  add constraint ai_generations_decided_requires_target check (
    status not in ('prepared', 'accepted')
    or (accepted_target_kind is not null and accepted_target_id is not null)
  );

comment on column public.ai_generations.status is
  'drafted = generated only; prepared = Operator Mode copied it into a working draft; accepted/rejected = explicit human decision.';

-- Keep the audit vocabulary truthful about automated preparation.
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
      'analytics_sync_started',
      'analytics_sync_completed',
      'analytics_sync_failed',
      'analytics_permission_required',
      'analytics_manual_entry_recorded',
      'growth_goal_created',
      'growth_goal_updated',
      'growth_experiment_created',
      'growth_experiment_completed',
      'ai_generation_requested',
      'ai_generation_completed',
      'ai_generation_failed',
      'ai_generation_prepared',
      'ai_generation_accepted',
      'ai_generation_rejected',
      'voice_generation_requested',
      'voice_generation_completed',
      'voice_generation_failed',
      'render_requested',
      'render_started',
      'render_completed',
      'render_failed',
      'render_cancelled',
      'production_job_created',
      'production_job_advanced',
      'production_job_cancelled',
      'production_job_failed',
      'planner_item_created',
      'planner_item_updated',
      'planner_item_deleted',
      'licence_record_created',
      'licence_record_updated',
      'licence_record_deleted',
      'settings_updated',
      'generated_media_deleted'
    )
  );


-- ---------------------------------------------------------------------------
-- Operator Mode internal invocation key
-- ---------------------------------------------------------------------------
-- Only the SHA-256 digest is stored in Postgres. The plaintext key is kept in
-- the deployment environment and is never committed or exposed to the browser.

create table if not exists public.automation_internal_keys (
  id text primary key,
  key_sha256 text not null
    check (key_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.automation_internal_keys enable row level security;
revoke all on public.automation_internal_keys from anon, authenticated;
grant select on table public.automation_internal_keys to service_role;

insert into public.automation_internal_keys (id, key_sha256)
values (
  'operator-default',
  '323a181162629c5ce5fa7c7034ccd766616d931999da500d3362eea77d3e6777'
)
on conflict (id) do update
set key_sha256 = excluded.key_sha256;


-- ---------------------------------------------------------------------------
-- Short-lived work claims
-- ---------------------------------------------------------------------------
-- A unique claim prevents a scheduled pass and a manual pass from preparing
-- the same content item at the same time.

create table if not exists public.automation_claims (
  content_item_id uuid primary key references public.content_items (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  run_id uuid references public.automation_runs (id) on delete cascade,
  claim_token uuid not null unique default gen_random_uuid(),
  claimed_until timestamptz not null default (now() + interval '20 minutes'),
  created_at timestamptz not null default now()
);

alter table public.automation_claims enable row level security;
revoke all on public.automation_claims from anon, authenticated;
grant select, insert, update, delete on table public.automation_claims to service_role;

create index if not exists automation_claims_expiry_idx
  on public.automation_claims (claimed_until);
