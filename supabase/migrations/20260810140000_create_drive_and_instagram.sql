-- Stage 8: Google Drive media retrieval and Instagram publishing.
--
-- Two additions, and they are deliberately unequal in what they claim.
--
-- **Drive** is a read-only storage connection. It reuses the Stage 7 account
-- and credential tables rather than growing a second credentials system —
-- `platform` simply gains a value. That keeps one encrypted store, one OAuth
-- state table, one revocation path.
--
-- **Instagram** adds a container table, because Meta's publishing model is
-- genuinely two-phase: a container is created and processed, and only then is
-- it published. Recording the container id before publishing is what lets a
-- crashed worker ask Meta what happened instead of posting twice.

-- ---------------------------------------------------------------------------
-- social_accounts / oauth_states: allow a Drive connection
-- ---------------------------------------------------------------------------
--
-- `google_drive` is not a social platform, but it is an OAuth connection with
-- encrypted credentials that the owner can grant and revoke — which is exactly
-- what these tables model. Giving it its own row keeps its scope separate from
-- YouTube's, so disconnecting one does not silently break the other.

alter table public.social_accounts drop constraint if exists social_accounts_platform_check;

alter table public.social_accounts
  add constraint social_accounts_platform_check check (
    platform in ('youtube', 'instagram', 'tiktok', 'google_drive')
  );

alter table public.oauth_states drop constraint if exists oauth_states_platform_check;

alter table public.oauth_states
  add constraint oauth_states_platform_check check (
    platform in ('youtube', 'instagram', 'tiktok', 'google_drive')
  );

comment on column public.social_accounts.platform is
  'The external system this authorisation belongs to. google_drive is a read-only storage connection, not a publishing target.';

-- ---------------------------------------------------------------------------
-- media_assets: record where in Drive a file came from
-- ---------------------------------------------------------------------------
--
-- The folder an asset was imported from, kept for provenance. It is **not**
-- the security boundary — containment is re-proved against the configured root
-- at publish time, because a file can be moved in Drive after import.

alter table public.media_assets
  add column if not exists source_folder_id text
    check (source_folder_id is null or char_length(source_folder_id) <= 200),
  add column if not exists source_verified_at timestamptz;

comment on column public.media_assets.source_folder_id is
  'The Drive folder this asset was imported from. Provenance only — containment is re-proved at publish time.';

-- ---------------------------------------------------------------------------
-- instagram_media_metadata
-- ---------------------------------------------------------------------------
--
-- Instagram-specific settings for one platform variant. Only fields the
-- current Content Publishing API documents are represented.

create table if not exists public.instagram_media_metadata (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform_variant_id uuid not null unique
    references public.platform_variants (id) on delete cascade,

  -- Which publishing flow this variant uses. Each has different media
  -- requirements and, critically, a different delivery mechanism: only reels
  -- can be uploaded as bytes.
  media_type text not null default 'reels'
    check (media_type in ('reels', 'image', 'carousel')),

  -- Reels only. A cover frame chosen from the owner's media.
  cover_media_asset_id uuid
    references public.media_assets (id) on delete set null,

  -- Whether a reel also appears on the main feed.
  share_to_feed boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.instagram_media_metadata is
  'Instagram publishing settings for one platform variant. Only fields documented by the current Content Publishing API.';

drop trigger if exists instagram_media_metadata_set_updated_at
  on public.instagram_media_metadata;
create trigger instagram_media_metadata_set_updated_at
before update on public.instagram_media_metadata
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- instagram_publish_containers  (server-only)
-- ---------------------------------------------------------------------------
--
-- Meta's publishing model is two-phase: create a container, wait for it to
-- finish processing, then publish it. Those are separate calls with a gap
-- between them, and the gap is where a worker can die.
--
-- This table closes that gap. The container id is written **before** the
-- publish call, so a retry can ask Meta for the container's state instead of
-- creating a second one. A container id is not a post; only
-- `published_media_id` is.

create table if not exists public.instagram_publish_containers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scheduled_post_id uuid not null
    references public.scheduled_posts (id) on delete cascade,

  -- Binds the schedule, the platform and the approval, exactly as the YouTube
  -- upload session does. A retry of the same approved operation finds this
  -- container; a different operation correctly creates its own.
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 16 and 200),

  container_id text not null check (char_length(container_id) between 1 and 200),
  media_type text not null check (media_type in ('reels', 'image', 'carousel')),

  -- Mirrors Meta's documented container status_code values.
  status text not null default 'in_progress'
    check (status in ('in_progress', 'finished', 'published', 'error', 'expired')),

  -- Meta's own id for the published post. The only thing that proves a
  -- publish happened.
  published_media_id text
    check (published_media_id is null or char_length(published_media_id) <= 200),

  -- The safe error code, never Meta's raw payload.
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint instagram_containers_published_requires_media_id check (
    status <> 'published' or published_media_id is not null
  )
);

comment on table public.instagram_publish_containers is
  'Instagram media containers. Written before publishing so a crashed worker can reconcile rather than post twice. RLS enabled with no policies: server-only.';

create index if not exists instagram_containers_post_idx
  on public.instagram_publish_containers (scheduled_post_id);

drop trigger if exists instagram_publish_containers_set_updated_at
  on public.instagram_publish_containers;
create trigger instagram_publish_containers_set_updated_at
before update on public.instagram_publish_containers
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log: Drive and Instagram actions
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
      'instagram_publish_failed'
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
      'media_asset'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.instagram_media_metadata enable row level security;
alter table public.instagram_publish_containers enable row level security;

revoke all on public.instagram_media_metadata from anon;
revoke all on public.instagram_publish_containers from anon;

-- Containers get **no policies**, like the YouTube upload sessions they
-- mirror. They are worker state, and a browser has no business writing a
-- container id that would later be read as proof a post exists.
revoke all on public.instagram_publish_containers from authenticated;

-- instagram_media_metadata ---------------------------------------------------

drop policy if exists "Owners can read their Instagram metadata" on public.instagram_media_metadata;
create policy "Owners can read their Instagram metadata"
on public.instagram_media_metadata for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their Instagram metadata" on public.instagram_media_metadata;
create policy "Owners can create their Instagram metadata"
on public.instagram_media_metadata for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their Instagram metadata" on public.instagram_media_metadata;
create policy "Owners can update their Instagram metadata"
on public.instagram_media_metadata for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their Instagram metadata" on public.instagram_media_metadata;
create policy "Owners can delete their Instagram metadata"
on public.instagram_media_metadata for delete to authenticated
using ((select auth.uid()) = owner_id);
