-- Stage 11: Final production automation.
--
-- The completion stage: private generated-media storage, real rendering
-- lifecycle state, ElevenLabs voice jobs, AI generation provenance, the
-- Content Planner, the Rights & Licences register, owner settings, and the
-- production pipeline that links them.
--
-- Two rules shape everything here:
--
--   1. **Nothing in this migration can publish.** No new table touches
--      scheduling or publishing state, and no policy widens an existing one.
--   2. **Generated media is private.** The bucket is not public, has no
--      browser policies at all, and every byte moves through trusted server
--      code. The browser sees short-lived signed URLs and nothing else.

-- ---------------------------------------------------------------------------
-- Private generated-media bucket
-- ---------------------------------------------------------------------------
--
-- One bucket, `generated-media`, `public = false`. **No storage.objects
-- policies are created for it** — the same worker-only pattern as the
-- credential tables: with RLS enabled and no policy, the browser's storage
-- API calls are refused outright, and only the trusted server credential
-- (which bypasses RLS) can read or write objects. Signed URLs are minted
-- exclusively by server code that first proves ownership of the referenced
-- asset row, and object keys always begin with the owner's id.

insert into storage.buckets (id, name, public)
values ('generated-media', 'generated-media', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- media_assets: generated provenance
-- ---------------------------------------------------------------------------
--
-- A rendered video or a voiceover becomes an ordinary `media_assets` row with
-- `storage_provider = 'supabase_storage'` and the object key in
-- `external_file_id` — the registry publishing already reads. These two
-- columns record *how the file came to exist*, so a generated file is always
-- traceable back to the job that produced it and can never masquerade as an
-- imported one.

alter table public.media_assets
  add column if not exists generated_kind text
    check (
      generated_kind is null
      or generated_kind in ('rendered_video', 'voiceover')
    ),
  add column if not exists generated_job_id uuid;

comment on column public.media_assets.generated_kind is
  'Set only on files this application generated (render output, voiceover). Null for imported media.';
comment on column public.media_assets.generated_job_id is
  'The render_jobs or voice_jobs row that produced this file. Provenance, not a foreign key: the job tables reference the asset, and a two-way FK would make deletion order impossible.';

-- ---------------------------------------------------------------------------
-- render_jobs: the columns a real renderer needs
-- ---------------------------------------------------------------------------
--
-- Stage 4 created the table and the state machine; Stage 11 connects a real
-- provider. Three additions:
--
-- `output_storage_path` is recorded when the job is claimed, **before**
-- rendering starts, and is deterministic (`<owner>/rendered_video/render-<job>.mp4`).
-- That is what makes crash reconciliation possible: a worker that died after
-- writing the file but before completing the row can be recovered by checking
-- whether the recorded path exists, instead of blindly rendering a duplicate.
--
-- `failure_category` joins the free-text reason so retry classification is a
-- vocabulary, not a string match. `claimed_at` records when a worker took the
-- job, so a job stuck in `rendering` has a visible age.

alter table public.render_jobs
  add column if not exists output_storage_path text
    check (
      output_storage_path is null or char_length(output_storage_path) <= 500
    ),
  add column if not exists failure_category text
    check (
      failure_category is null or char_length(failure_category) <= 60
    ),
  add column if not exists claimed_at timestamptz;

comment on column public.render_jobs.output_storage_path is
  'Deterministic object key in the generated-media bucket, recorded at claim time. Reconciliation checks this path; it is never taken from a request.';

-- ---------------------------------------------------------------------------
-- voice_jobs  (browser: read-only)
-- ---------------------------------------------------------------------------
--
-- Every ElevenLabs narration request, including the ones that failed or were
-- refused. Written only by trusted server code: the browser can watch the
-- history but cannot manufacture a "completed" generation, for the same
-- reason it cannot write an analytics sync run.

create table if not exists public.voice_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  video_project_id uuid references public.video_projects (id) on delete set null,
  script_revision_id uuid references public.script_revisions (id) on delete set null,
  content_item_id uuid references public.content_items (id) on delete set null,

  -- The voice Dave configured, and the model asked for. Recorded verbatim for
  -- traceability; never a cloned or invented voice — the provider can only
  -- reference a voice that already exists in the connected account.
  voice_id text not null check (char_length(voice_id) between 1 and 120),
  model_id text not null check (char_length(model_id) between 1 and 120),

  -- How much text was sent. The provider enforces the documented per-model
  -- character limit before sending; this records what was actually sent.
  character_count integer not null check (character_count >= 0),

  status text not null default 'queued'
    check (status in ('queued', 'generating', 'completed', 'failed', 'cancelled')),

  failure_category text
    check (failure_category is null or char_length(failure_category) <= 60),
  failure_detail text
    check (failure_detail is null or char_length(failure_detail) <= 1000),

  -- The stored audio, once it genuinely exists in the generated-media bucket.
  output_media_asset_id uuid references public.media_assets (id) on delete set null,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A completed generation must have produced audio; a failure must say why.
  constraint voice_jobs_completed_requires_output check (
    status <> 'completed' or output_media_asset_id is not null
  ),
  constraint voice_jobs_failed_requires_category check (
    status <> 'failed' or failure_category is not null
  )
);

comment on table public.voice_jobs is
  'Every voice generation request, including refusals. Browser reads only; trusted server code writes. Completed requires a stored file.';

create index if not exists voice_jobs_owner_idx
  on public.voice_jobs (owner_id, requested_at desc);
create index if not exists voice_jobs_project_idx
  on public.voice_jobs (video_project_id);

drop trigger if exists voice_jobs_set_updated_at on public.voice_jobs;
create trigger voice_jobs_set_updated_at
before update on public.voice_jobs
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- ai_generations  (provenance; drafts only)
-- ---------------------------------------------------------------------------
--
-- One row per AI generation: who asked, what kind, which provider and model,
-- what came back, and what a human decided about it. The `output` is a draft
-- and nothing here can make it anything else — acceptance happens through the
-- existing revision/variant machinery, and this table only records where the
-- accepted draft went.
--
-- **There is no Scripture output field.** The response schema the provider
-- enforces has typed fields (script, declaration, prayer, commentary,
-- caption, …) and none of them is Scripture; `scripture_reference` records
-- which verified passage was provided as read-only context, never text the
-- model produced.

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  content_item_id uuid references public.content_items (id) on delete set null,
  platform_variant_id uuid references public.platform_variants (id) on delete set null,

  generation_type text not null check (
    generation_type in (
      'script_draft',
      'script_shorten',
      'commentary_expand',
      'short_conversion',
      'prayer',
      'declaration',
      'title',
      'description',
      'caption',
      'hashtags',
      'cta',
      'plan_note'
    )
  ),

  provider text not null check (char_length(provider) between 1 and 60),
  model text not null check (char_length(model) between 1 and 120),
  prompt_template_version text not null
    check (char_length(prompt_template_version) between 1 and 40),

  -- The verified reference handed to the model as read-only context, if any.
  -- A reference, never verse text the model wrote.
  scripture_reference text
    check (scripture_reference is null or char_length(scripture_reference) <= 200),

  -- The draft fields exactly as the schema-constrained response returned
  -- them. Draft content only — no secrets, no provider internals, no hidden
  -- reasoning.
  output jsonb not null,

  status text not null default 'drafted'
    check (status in ('drafted', 'accepted', 'rejected')),

  -- Where an accepted draft went: the record acceptance created or updated.
  accepted_target_kind text check (
    accepted_target_kind is null
    or accepted_target_kind in ('script_revision', 'platform_variant', 'planner_item')
  ),
  accepted_target_id uuid,

  created_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now(),

  -- An accepted generation must say what it became.
  constraint ai_generations_accepted_requires_target check (
    status <> 'accepted'
    or (accepted_target_kind is not null and accepted_target_id is not null)
  )
);

comment on table public.ai_generations is
  'AI generation provenance. Everything here is a draft; acceptance is a human act recorded with its target. No Scripture output field exists.';

create index if not exists ai_generations_owner_idx
  on public.ai_generations (owner_id, created_at desc);
create index if not exists ai_generations_item_idx
  on public.ai_generations (content_item_id);

drop trigger if exists ai_generations_set_updated_at on public.ai_generations;
create trigger ai_generations_set_updated_at
before update on public.ai_generations
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- production_jobs  (the workflow assistant's state)
-- ---------------------------------------------------------------------------
--
-- Production state is its own vocabulary, deliberately separate from publish
-- state. A production job links the artefacts the pipeline produced and ends
-- at `ready_for_review` — there is no edge from any production status into
-- scheduling or publishing, and the pipeline code imports nothing from the
-- publishing worker.

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  content_item_id uuid not null
    references public.content_items (id) on delete cascade,
  video_project_id uuid references public.video_projects (id) on delete set null,

  status text not null default 'pending'
    check (status in (
      'pending',
      'planning',
      'generating_text',
      'generating_voice',
      'rendering',
      'ready_for_review',
      'failed',
      'cancelled'
    )),

  -- The artefacts each step produced, linked as they appear.
  ai_generation_id uuid references public.ai_generations (id) on delete set null,
  voice_job_id uuid references public.voice_jobs (id) on delete set null,
  render_job_id uuid references public.render_jobs (id) on delete set null,

  failure_category text
    check (failure_category is null or char_length(failure_category) <= 60),
  failure_detail text
    check (failure_detail is null or char_length(failure_detail) <= 1000),

  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint production_jobs_failed_requires_category check (
    status <> 'failed' or failure_category is not null
  )
);

comment on table public.production_jobs is
  'Workflow assistant state. Ends at ready_for_review: approval, scheduling and publishing remain the existing human-driven paths, and no status here reaches them.';

create index if not exists production_jobs_owner_idx
  on public.production_jobs (owner_id, created_at desc);
create index if not exists production_jobs_item_idx
  on public.production_jobs (content_item_id);

drop trigger if exists production_jobs_set_updated_at on public.production_jobs;
create trigger production_jobs_set_updated_at
before update on public.production_jobs
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- planner_items  (planning is not scheduling)
-- ---------------------------------------------------------------------------

create table if not exists public.planner_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (char_length(trim(title)) between 1 and 200),
  topic text check (topic is null or char_length(topic) <= 100),
  content_type text check (content_type is null or char_length(content_type) <= 60),

  -- Where this is intended to go. Intent, not a schedule: nothing here
  -- creates a scheduled post.
  target_platforms text[] not null default '{}'
    check (target_platforms <@ array['youtube', 'instagram', 'tiktok']::text[]),

  target_date date,

  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high')),

  status text not null default 'idea'
    check (status in ('idea', 'planned', 'in_production', 'done', 'dropped')),

  -- A series/campaign label, free text so Dave names his own series.
  series text check (series is null or char_length(series) <= 100),

  notes text check (notes is null or char_length(notes) <= 2000),

  content_item_id uuid references public.content_items (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.planner_items is
  'Operational planning records. A planner item is never a scheduled post; scheduling remains the Stage 5 path.';

create index if not exists planner_items_owner_idx
  on public.planner_items (owner_id, status, target_date);

drop trigger if exists planner_items_set_updated_at on public.planner_items;
create trigger planner_items_set_updated_at
before update on public.planner_items
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- licence_records  (administrative register, not legal advice)
-- ---------------------------------------------------------------------------

create table if not exists public.licence_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  asset_label text not null check (char_length(trim(asset_label)) between 1 and 200),
  media_asset_id uuid references public.media_assets (id) on delete set null,

  rights_source text check (rights_source is null or char_length(rights_source) <= 200),
  licence_type text check (licence_type is null or char_length(licence_type) <= 100),
  licensor text check (licensor is null or char_length(licensor) <= 200),
  permitted_use text check (permitted_use is null or char_length(permitted_use) <= 1000),
  proof_reference text check (proof_reference is null or char_length(proof_reference) <= 500),

  starts_on date,
  expires_on date,

  status text not null default 'needs_review'
    check (status in ('active', 'expiring', 'expired', 'needs_review', 'restricted')),

  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint licence_records_dates_ordered check (
    expires_on is null or starts_on is null or expires_on >= starts_on
  )
);

comment on table public.licence_records is
  'Rights provenance register. An administrative record of what is licensed and how — never a legal conclusion, and publishing is not blocked by an empty optional field.';

create index if not exists licence_records_owner_idx
  on public.licence_records (owner_id, status);

drop trigger if exists licence_records_set_updated_at on public.licence_records;
create trigger licence_records_set_updated_at
before update on public.licence_records
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- app_settings  (owner configuration; never secrets)
-- ---------------------------------------------------------------------------
--
-- One row per owner. **No credential is ever stored here** — secrets live in
-- the deployment platform's environment, and the interface reports them only
-- as Configured / Not configured. This table holds preferences.

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  timezone text not null default 'Europe/London'
    check (char_length(timezone) between 1 and 60),

  default_aspect_ratio text not null default '9:16'
    check (default_aspect_ratio in ('9:16', '16:9', '1:1')),

  default_cta text check (default_cta is null or char_length(default_cta) <= 300),
  brand_line text check (brand_line is null or char_length(brand_line) <= 200),

  -- Which of the voices in Dave's ElevenLabs account narration should use.
  -- An identifier, not a credential; the key stays server-side.
  elevenlabs_voice_id text
    check (elevenlabs_voice_id is null or char_length(elevenlabs_voice_id) <= 120),
  elevenlabs_model_id text
    check (elevenlabs_model_id is null or char_length(elevenlabs_model_id) <= 120),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_settings_one_per_owner unique (owner_id)
);

comment on table public.app_settings is
  'Owner preferences. Never credentials: secrets live in the environment and appear in the interface only as Configured / Not configured.';

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log: Stage 11 vocabulary
-- ---------------------------------------------------------------------------
--
-- As always: the audit log records that something happened and to what —
-- never secrets, provider payloads, generated text or hidden reasoning.

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
      -- Stage 11. Requests, outcomes and human decisions — no generated
      -- content, no metric values, no secrets.
      'ai_generation_requested',
      'ai_generation_completed',
      'ai_generation_failed',
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
      'growth_experiment',
      'ai_generation',
      'voice_job',
      'render_job',
      'production_job',
      'planner_item',
      'licence_record',
      'app_settings'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.voice_jobs enable row level security;
alter table public.ai_generations enable row level security;
alter table public.production_jobs enable row level security;
alter table public.planner_items enable row level security;
alter table public.licence_records enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.voice_jobs from anon;
revoke all on public.ai_generations from anon;
revoke all on public.production_jobs from anon;
revoke all on public.planner_items from anon;
revoke all on public.licence_records from anon;
revoke all on public.app_settings from anon;

-- voice_jobs ------------------------------------------------------------------
--
-- **Read-only from the browser.** A voice job is written by trusted server
-- code as the generation actually happens; a browser that could write one
-- could record a narration that was never generated.

drop policy if exists "Owners can read their voice jobs" on public.voice_jobs;
create policy "Owners can read their voice jobs"
on public.voice_jobs for select to authenticated
using ((select auth.uid()) = owner_id);

-- ai_generations --------------------------------------------------------------
--
-- Read-only from the browser for the same reason: the generation row is
-- written by the server action that performed the generation, and the
-- accept/reject transition is also a server decision path. Nothing a browser
-- could write here would be provenance.

drop policy if exists "Owners can read their AI generations" on public.ai_generations;
create policy "Owners can read their AI generations"
on public.ai_generations for select to authenticated
using ((select auth.uid()) = owner_id);

-- production_jobs -------------------------------------------------------------
--
-- The owner drives the pipeline, so owner CRUD applies — with parent
-- ownership proved on write, as every child table in this schema does.

drop policy if exists "Owners can read their production jobs" on public.production_jobs;
create policy "Owners can read their production jobs"
on public.production_jobs for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their production jobs" on public.production_jobs;
create policy "Owners can create their production jobs"
on public.production_jobs for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their production jobs" on public.production_jobs;
create policy "Owners can update their production jobs"
on public.production_jobs for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their production jobs" on public.production_jobs;
create policy "Owners can delete their production jobs"
on public.production_jobs for delete to authenticated
using ((select auth.uid()) = owner_id);

-- planner_items ---------------------------------------------------------------

drop policy if exists "Owners can read their planner items" on public.planner_items;
create policy "Owners can read their planner items"
on public.planner_items for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their planner items" on public.planner_items;
create policy "Owners can create their planner items"
on public.planner_items for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their planner items" on public.planner_items;
create policy "Owners can update their planner items"
on public.planner_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their planner items" on public.planner_items;
create policy "Owners can delete their planner items"
on public.planner_items for delete to authenticated
using ((select auth.uid()) = owner_id);

-- licence_records -------------------------------------------------------------

drop policy if exists "Owners can read their licence records" on public.licence_records;
create policy "Owners can read their licence records"
on public.licence_records for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their licence records" on public.licence_records;
create policy "Owners can create their licence records"
on public.licence_records for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their licence records" on public.licence_records;
create policy "Owners can update their licence records"
on public.licence_records for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their licence records" on public.licence_records;
create policy "Owners can delete their licence records"
on public.licence_records for delete to authenticated
using ((select auth.uid()) = owner_id);

-- app_settings ----------------------------------------------------------------

drop policy if exists "Owners can read their settings" on public.app_settings;
create policy "Owners can read their settings"
on public.app_settings for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their settings" on public.app_settings;
create policy "Owners can create their settings"
on public.app_settings for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their settings" on public.app_settings;
create policy "Owners can update their settings"
on public.app_settings for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
