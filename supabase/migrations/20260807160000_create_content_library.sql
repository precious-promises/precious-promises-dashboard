-- Stage 2: content library and media foundation.
--
-- Three tables: content items, media asset metadata, and the join between
-- them. Every one is owner-scoped and protected by Row Level Security.
--
-- The application never uses the service role key, so every statement it issues
-- against these tables is subject to the policies below.
--
-- Vocabulary is enforced with check constraints rather than Postgres enums:
-- adding a content type later is then an ordinary migration rather than an
-- ALTER TYPE that cannot run inside a transaction with other statements.

-- ---------------------------------------------------------------------------
-- content_items
-- ---------------------------------------------------------------------------

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (char_length(trim(title)) between 1 and 200),

  content_type text not null check (
    content_type in (
      'youtube_short',
      'youtube_standard_video',
      'youtube_long_video',
      'youtube_sleep_video',
      'youtube_prayer_video',
      'youtube_declaration_video',
      'youtube_scripture_reading',
      'youtube_compilation',
      'instagram_reel',
      'instagram_image',
      'instagram_carousel',
      'tiktok_video'
    )
  ),

  topic text check (topic is null or char_length(topic) <= 120),

  -- Scripture is stored exactly as entered. Nothing in the database
  -- reformats, completes or corrects it.
  scripture_reference text check (
    scripture_reference is null or char_length(scripture_reference) <= 160
  ),
  scripture_text text check (
    scripture_text is null or char_length(scripture_text) <= 5000
  ),
  scripture_translation text not null default 'KJV'
    check (char_length(trim(scripture_translation)) between 1 and 40),

  scripture_verification_status text not null default 'unverified' check (
    scripture_verification_status in (
      'unverified',
      'manually_verified',
      'verification_required'
    )
  ),
  scripture_verified_at timestamptz,
  scripture_verified_by uuid references auth.users (id) on delete set null,

  -- Declarations, prayers and commentary live here, never in scripture_text.
  description text check (
    description is null or char_length(description) <= 5000
  ),

  -- Stage 2 covers authoring only. Approval, scheduling and publishing
  -- statuses arrive with the systems that can honour them.
  status text not null default 'draft'
    check (status in ('draft', 'ready_for_review', 'archived')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Verification metadata only makes sense when something is verified.
  constraint content_items_verification_metadata_consistent check (
    (
      scripture_verification_status = 'manually_verified'
      and scripture_verified_at is not null
    )
    or (
      scripture_verification_status <> 'manually_verified'
      and scripture_verified_at is null
      and scripture_verified_by is null
    )
  )
);

comment on table public.content_items is
  'One piece of content being authored. Owner-scoped by RLS.';
comment on column public.content_items.scripture_verification_status is
  'unverified | manually_verified | verification_required. Editing reference or text after verification resets this to verification_required.';

create index if not exists content_items_owner_updated_idx
  on public.content_items (owner_id, updated_at desc);
create index if not exists content_items_owner_status_idx
  on public.content_items (owner_id, status);

-- ---------------------------------------------------------------------------
-- media_assets
-- ---------------------------------------------------------------------------
--
-- Metadata only. The bytes live in Google Drive (planned), Supabase Storage or
-- an external location — never in Postgres. There is no bytea column here on
-- purpose.

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(trim(name)) between 1 and 200),

  media_type text not null
    check (media_type in ('image', 'video', 'audio', 'document')),

  storage_provider text not null
    check (storage_provider in ('google_drive', 'supabase_storage', 'external')),

  -- A reference to the file wherever it actually lives.
  external_file_id text check (
    external_file_id is null or char_length(external_file_id) <= 255
  ),
  external_url text check (
    external_url is null or char_length(external_url) <= 2048
  ),

  mime_type text check (mime_type is null or char_length(mime_type) <= 160),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  width integer check (width is null or width >= 0),
  height integer check (height is null or height >= 0),
  duration_seconds integer check (
    duration_seconds is null or duration_seconds >= 0
  ),

  rights_status text not null default 'unknown' check (
    rights_status in
      ('unknown', 'owned', 'licensed', 'public_domain', 'restricted')
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_assets is
  'Metadata describing a media file held outside Postgres. Owner-scoped by RLS.';

create index if not exists media_assets_owner_updated_idx
  on public.media_assets (owner_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- content_media
-- ---------------------------------------------------------------------------

create table if not exists public.content_media (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null
    references public.content_items (id) on delete cascade,
  media_asset_id uuid not null
    references public.media_assets (id) on delete cascade,

  purpose text not null default 'supporting' check (
    purpose in
      ('primary', 'thumbnail', 'background', 'audio_track', 'supporting')
  ),
  sort_order integer not null default 0 check (sort_order >= 0),

  created_at timestamptz not null default now(),

  unique (content_item_id, media_asset_id, purpose)
);

comment on table public.content_media is
  'Join between content items and media assets. Access follows the parent content item''s owner.';

create index if not exists content_media_content_idx
  on public.content_media (content_item_id, sort_order);
create index if not exists content_media_asset_idx
  on public.content_media (media_asset_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
-- Reuses public.handle_updated_at() from the profiles migration.

drop trigger if exists content_items_set_updated_at on public.content_items;
create trigger content_items_set_updated_at
before update on public.content_items
for each row execute function public.handle_updated_at();

drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
before update on public.media_assets
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Enabling RLS denies everything by default. Each policy below re-opens one
-- operation, for the authenticated role only, restricted to the caller's own
-- rows. No catch-all policy, and no policy for anon.
--
-- auth.uid() is wrapped in a scalar subquery so it is evaluated once per
-- statement rather than once per row.

alter table public.content_items enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_media enable row level security;

revoke all on public.content_items from anon;
revoke all on public.media_assets from anon;
revoke all on public.content_media from anon;

-- content_items ------------------------------------------------------------

drop policy if exists "Owners can read their content" on public.content_items;
create policy "Owners can read their content"
on public.content_items for select to authenticated
using ((select auth.uid()) = owner_id);

-- WITH CHECK on insert is what actually stops a user creating rows owned by
-- somebody else, regardless of what the application sends.
drop policy if exists "Owners can create their content" on public.content_items;
create policy "Owners can create their content"
on public.content_items for insert to authenticated
with check ((select auth.uid()) = owner_id);

-- USING selects which rows may be updated; WITH CHECK constrains what they may
-- become. Without the latter a user could reassign owner_id away from
-- themselves.
drop policy if exists "Owners can update their content" on public.content_items;
create policy "Owners can update their content"
on public.content_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their content" on public.content_items;
create policy "Owners can delete their content"
on public.content_items for delete to authenticated
using ((select auth.uid()) = owner_id);

-- media_assets -------------------------------------------------------------

drop policy if exists "Owners can read their media" on public.media_assets;
create policy "Owners can read their media"
on public.media_assets for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their media" on public.media_assets;
create policy "Owners can create their media"
on public.media_assets for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their media" on public.media_assets;
create policy "Owners can update their media"
on public.media_assets for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their media" on public.media_assets;
create policy "Owners can delete their media"
on public.media_assets for delete to authenticated
using ((select auth.uid()) = owner_id);

-- content_media ------------------------------------------------------------
--
-- This table has no owner_id of its own. Ownership is inherited: a row is
-- reachable only if the caller owns the content item it belongs to.
--
-- Writes additionally require ownership of the media asset, so a user cannot
-- attach somebody else's asset to their own content and read its metadata
-- through the join.

drop policy if exists "Owners can read their content media" on public.content_media;
create policy "Owners can read their content media"
on public.content_media for select to authenticated
using (
  exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can link their content media" on public.content_media;
create policy "Owners can link their content media"
on public.content_media for insert to authenticated
with check (
  exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.media_assets ma
    where ma.id = media_asset_id and ma.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their content media" on public.content_media;
create policy "Owners can update their content media"
on public.content_media for update to authenticated
using (
  exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
  and exists (
    select 1 from public.media_assets ma
    where ma.id = media_asset_id and ma.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can unlink their content media" on public.content_media;
create policy "Owners can unlink their content media"
on public.content_media for delete to authenticated
using (
  exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);
