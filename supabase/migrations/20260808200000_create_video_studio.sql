-- Stage 4: the Video Creation Studio.
--
-- Four tables covering video production: projects, their scenes, the media
-- slots a project fills, and render jobs.
--
-- Two structural guarantees are worth reading before the columns:
--
-- 1. **Scripture is never copied into a scene.** A scene of type 'scripture'
--    is forbidden from holding text of its own; it references the project's
--    content item and the verse is read from there at preview time. A verse
--    duplicated into an editable column would drift from the verified record
--    and nobody would notice.
--
-- 2. **A render job cannot claim success without an output.** `completed`
--    requires an output media asset, and `failed` requires a reason. A code
--    path that ran to the end but produced no file cannot be recorded as a
--    finished render.

-- ---------------------------------------------------------------------------
-- video_projects
-- ---------------------------------------------------------------------------

create table if not exists public.video_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null
    references public.content_items (id) on delete cascade,

  name text not null check (char_length(trim(name)) between 1 and 200),

  -- The three formats the product publishes in. Stored as the ratio itself so
  -- the value reads the same in the database as it does in the interface.
  aspect_ratio text not null check (aspect_ratio in ('9:16', '16:9', '1:1')),

  -- Maintained by the application from the sum of scene durations. It is an
  -- estimate of the composition's length, not a measurement of a rendered
  -- file, and is named so.
  duration_estimate_seconds numeric(8, 2) not null default 0
    check (duration_estimate_seconds >= 0),

  -- Authoring statuses only. 'approved', 'scheduled' and 'published' are
  -- absent because approval, scheduling and publishing do not exist.
  status text not null default 'draft'
    check (status in ('draft', 'ready_for_review', 'archived')),

  current_revision integer not null default 1 check (current_revision >= 1),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.video_projects is
  'A video composition built from a content item. Editing and preview only — nothing here renders or publishes.';
comment on column public.video_projects.duration_estimate_seconds is
  'Sum of scene durations. An estimate of the composition, never a measurement of a rendered file.';
comment on column public.video_projects.current_revision is
  'Incremented when the scene list changes, so a render job records which revision it was asked to render.';

create index if not exists video_projects_owner_idx
  on public.video_projects (owner_id, updated_at desc);
create index if not exists video_projects_item_idx
  on public.video_projects (content_item_id);

drop trigger if exists video_projects_set_updated_at on public.video_projects;
create trigger video_projects_set_updated_at
before update on public.video_projects
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- video_scenes
-- ---------------------------------------------------------------------------
--
-- One scene is one layer of the finished piece, in order.

create table if not exists public.video_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null
    references public.video_projects (id) on delete cascade,

  scene_order integer not null check (scene_order >= 1),

  -- Declaration and prayer are separate types from one another and from
  -- scripture, so the three stay distinguishable in the data as well as on
  -- screen. They are the owner's words; scripture is not.
  scene_type text not null check (
    scene_type in (
      'scripture',
      'explanation',
      'declaration',
      'prayer',
      'branding',
      'outro'
    )
  ),

  -- Where the words come from:
  --   content_scripture — read from the project's content item (scripture only)
  --   script_revision   — read from the latest saved script revision
  --   custom            — typed into this scene
  text_source text not null default 'custom'
    check (text_source in ('content_scripture', 'script_revision', 'custom')),

  text_content text check (text_content is null or char_length(text_content) <= 5000),

  -- Background media for this scene. Nulled rather than cascaded, so removing
  -- an asset from the library empties the slot instead of deleting the scene.
  media_asset_id uuid references public.media_assets (id) on delete set null,

  duration_seconds numeric(6, 2) not null default 5
    check (duration_seconds >= 0.5 and duration_seconds <= 600),

  transition text not null default 'none'
    check (transition in ('none', 'fade', 'dissolve', 'slide')),

  text_position text not null default 'centre'
    check (text_position in ('top', 'centre', 'bottom')),
  text_align text not null default 'centre'
    check (text_align in ('left', 'centre', 'right')),
  text_animation text not null default 'none'
    check (text_animation in ('none', 'fade_in', 'rise', 'scale_in')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, scene_order),

  -- A Scripture scene references the verified record and carries no text of
  -- its own. This is the constraint that makes "the studio cannot rewrite a
  -- verse" a property of the database rather than a promise about the UI.
  constraint video_scenes_scripture_is_referenced check (
    scene_type <> 'scripture'
    or (text_source = 'content_scripture' and text_content is null)
  ),

  -- Conversely, only a Scripture scene may read from the Scripture record, so
  -- a prayer cannot quietly render a verse as though it were the prayer.
  constraint video_scenes_only_scripture_reads_scripture check (
    text_source <> 'content_scripture' or scene_type = 'scripture'
  ),

  -- Text pulled from a script revision is not stored twice.
  constraint video_scenes_referenced_text_is_not_copied check (
    text_source <> 'script_revision' or text_content is null
  )
);

comment on table public.video_scenes is
  'An ordered layer of a video project. Scripture scenes reference content_items; they never hold verse text.';
comment on column public.video_scenes.text_source is
  'content_scripture reads the verified verse; script_revision reads the saved script; custom is typed here.';
comment on column public.video_scenes.scene_type is
  'declaration and prayer are the owner''s own words. They are not Scripture and must never be presented as Scripture.';

create index if not exists video_scenes_project_order_idx
  on public.video_scenes (project_id, scene_order);
create index if not exists video_scenes_owner_idx
  on public.video_scenes (owner_id);

drop trigger if exists video_scenes_set_updated_at on public.video_scenes;
create trigger video_scenes_set_updated_at
before update on public.video_scenes
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- production_assets
-- ---------------------------------------------------------------------------
--
-- The project-level media slots: one background track, one voiceover, one
-- logo, one caption track. A slot is a reference to a library asset, not a
-- copy of it.

create table if not exists public.production_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null
    references public.video_projects (id) on delete cascade,
  media_asset_id uuid not null
    references public.media_assets (id) on delete cascade,

  role text not null check (
    role in (
      'background_video',
      'background_image',
      'background_audio',
      'voiceover',
      'logo',
      'caption_track'
    )
  ),

  starts_at_seconds numeric(8, 2) not null default 0
    check (starts_at_seconds >= 0),

  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One asset per slot. Two background audio tracks is a mixing decision the
  -- product has not made, and silently keeping both would surprise whoever
  -- eventually renders it.
  unique (project_id, role)
);

comment on table public.production_assets is
  'Project-level media slots — background, voiceover, logo, captions. References library assets; stores no bytes.';

create index if not exists production_assets_project_idx
  on public.production_assets (project_id);
create index if not exists production_assets_owner_idx
  on public.production_assets (owner_id);

drop trigger if exists production_assets_set_updated_at on public.production_assets;
create trigger production_assets_set_updated_at
before update on public.production_assets
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- render_jobs
-- ---------------------------------------------------------------------------
--
-- The record of every render that was asked for, including the ones that did
-- not happen. No rendering provider is connected in Stage 4, so every request
-- fails immediately and is recorded as a failure — which is the honest
-- outcome, and the reason this table exists now rather than later.

create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null
    references public.video_projects (id) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued', 'rendering', 'completed', 'failed', 'cancelled')),

  -- Which adapter was asked. 'none' records a request made while no provider
  -- was connected; it is not a provider that renders anything.
  provider text not null default 'none'
    check (provider in ('none', 'remotion_worker', 'remotion_lambda')),

  -- The project revision this job was asked to render, so a later edit cannot
  -- make a finished job appear to describe the current composition.
  project_revision integer not null check (project_revision >= 1),

  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 2000),

  -- The rendered file, once one genuinely exists.
  output_media_asset_id uuid references public.media_assets (id) on delete set null,

  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A completed render must have produced a file. Without this, a code path
  -- that finished without rendering anything could be written down as a
  -- success, which is the exact failure the project rules forbid.
  constraint render_jobs_completed_requires_output check (
    status <> 'completed' or output_media_asset_id is not null
  ),

  -- A failure must say why. An unexplained failure is not reviewable.
  constraint render_jobs_failed_requires_reason check (
    status <> 'failed' or failure_reason is not null
  ),

  -- Nothing can be completed by a provider that does not render.
  constraint render_jobs_none_provider_cannot_complete check (
    provider <> 'none' or status <> 'completed'
  )
);

comment on table public.render_jobs is
  'Every render request, including refusals. A completed job requires an output file; a failed job requires a reason.';
comment on column public.render_jobs.provider is
  'none records a request made while no rendering provider was connected. It renders nothing.';

create index if not exists render_jobs_project_idx
  on public.render_jobs (project_id, requested_at desc);
create index if not exists render_jobs_owner_idx
  on public.render_jobs (owner_id);

drop trigger if exists render_jobs_set_updated_at on public.render_jobs;
create trigger render_jobs_set_updated_at
before update on public.render_jobs
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Every table carries owner_id, and every child also references a parent.
-- Owning the row is not enough: a write must prove the parent belongs to the
-- same caller, otherwise a user could attach a scene, an asset slot or a
-- render job to somebody else's project.

alter table public.video_projects enable row level security;
alter table public.video_scenes enable row level security;
alter table public.production_assets enable row level security;
alter table public.render_jobs enable row level security;

revoke all on public.video_projects from anon;
revoke all on public.video_scenes from anon;
revoke all on public.production_assets from anon;
revoke all on public.render_jobs from anon;

-- video_projects ------------------------------------------------------------

drop policy if exists "Owners can read their video projects" on public.video_projects;
create policy "Owners can read their video projects"
on public.video_projects for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their video projects" on public.video_projects;
create policy "Owners can create their video projects"
on public.video_projects for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their video projects" on public.video_projects;
create policy "Owners can update their video projects"
on public.video_projects for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their video projects" on public.video_projects;
create policy "Owners can delete their video projects"
on public.video_projects for delete to authenticated
using ((select auth.uid()) = owner_id);

-- video_scenes --------------------------------------------------------------

drop policy if exists "Owners can read their video scenes" on public.video_scenes;
create policy "Owners can read their video scenes"
on public.video_scenes for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their video scenes" on public.video_scenes;
create policy "Owners can create their video scenes"
on public.video_scenes for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their video scenes" on public.video_scenes;
create policy "Owners can update their video scenes"
on public.video_scenes for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their video scenes" on public.video_scenes;
create policy "Owners can delete their video scenes"
on public.video_scenes for delete to authenticated
using ((select auth.uid()) = owner_id);

-- production_assets ---------------------------------------------------------
--
-- Writes additionally require ownership of the media asset, so a user cannot
-- attach somebody else's file to their own project and read its metadata back
-- through the join.

drop policy if exists "Owners can read their production assets" on public.production_assets;
create policy "Owners can read their production assets"
on public.production_assets for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their production assets" on public.production_assets;
create policy "Owners can create their production assets"
on public.production_assets for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.media_assets ma
    where ma.id = media_asset_id and ma.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their production assets" on public.production_assets;
create policy "Owners can update their production assets"
on public.production_assets for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.media_assets ma
    where ma.id = media_asset_id and ma.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their production assets" on public.production_assets;
create policy "Owners can delete their production assets"
on public.production_assets for delete to authenticated
using ((select auth.uid()) = owner_id);

-- render_jobs ---------------------------------------------------------------

drop policy if exists "Owners can read their render jobs" on public.render_jobs;
create policy "Owners can read their render jobs"
on public.render_jobs for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their render jobs" on public.render_jobs;
create policy "Owners can create their render jobs"
on public.render_jobs for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
);

-- UPDATE exists so a job can be cancelled, and so a real worker can advance
-- one later. The check constraints above still govern what a status may claim.
drop policy if exists "Owners can update their render jobs" on public.render_jobs;
create policy "Owners can update their render jobs"
on public.render_jobs for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.video_projects vp
    where vp.id = project_id and vp.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their render jobs" on public.render_jobs;
create policy "Owners can delete their render jobs"
on public.render_jobs for delete to authenticated
using ((select auth.uid()) = owner_id);
