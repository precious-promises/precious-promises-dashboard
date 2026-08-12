-- Stage 9: TikTok publishing.
--
-- TikTok reuses the generic account, credential and OAuth-state tables rather
-- than growing a parallel architecture — `social_accounts.platform` already
-- allows `tiktok`, so nothing changes there.
--
-- What is genuinely TikTok-specific:
--
-- 1. **Publication settings the creator must choose, not the app.** TikTok
--    returns the privacy levels and interaction settings a given creator is
--    allowed to use, and refuses a request that asks for one they are not.
--    Those choices are stored per variant.
-- 2. **A publish session**, because a chunked upload followed by a separate
--    status poll has a gap in the middle where a worker can die.

-- ---------------------------------------------------------------------------
-- tiktok_video_metadata
-- ---------------------------------------------------------------------------
--
-- Only fields the current Content Posting API documents.
--
-- Note what has **no default**: `privacy_level`. TikTok requires the value to
-- be one it returned for this creator, and an unaudited API client is
-- restricted to SELF_ONLY regardless of what is asked. Defaulting it would be
-- this application choosing an audience on Dave's behalf.

create table if not exists public.tiktok_video_metadata (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform_variant_id uuid not null unique
    references public.platform_variants (id) on delete cascade,

  -- Must match one of the privacy_level_options TikTok returned for this
  -- creator. Null means unanswered, and an upload is refused until it is set.
  privacy_level text
    check (
      privacy_level is null
      or privacy_level in (
        'PUBLIC_TO_EVERYONE',
        'MUTUAL_FOLLOW_FRIENDS',
        'FOLLOWER_OF_CREATOR',
        'SELF_ONLY'
      )
    ),

  -- Interaction controls. TikTok reports which of these a creator has
  -- disabled at the account level, and refuses a request that enables one
  -- they have turned off.
  disable_comment boolean not null default false,
  disable_duet boolean not null default false,
  disable_stitch boolean not null default false,

  -- Commercial-content disclosure. These are declarations with legal weight,
  -- so `is_commercial_content` has no true-by-default and the two branded
  -- flags are only meaningful when it is set.
  is_commercial_content boolean not null default false,
  is_branded_content boolean not null default false,
  is_your_brand boolean not null default false,

  -- Which delivery mode the owner intends. `direct_post` needs the publish
  -- scope and an audited client; `inbox` lands in TikTok's drafts;
  -- `manual` prepares everything for Dave to post by hand.
  delivery_mode text not null default 'inbox'
    check (delivery_mode in ('direct_post', 'inbox', 'manual')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Branded content cannot be posted privately. TikTok refuses the
  -- combination, so the database refuses it too rather than letting an
  -- upload fail at the last step.
  constraint tiktok_branded_content_cannot_be_private check (
    is_branded_content = false or privacy_level <> 'SELF_ONLY'
  ),
  -- A brand flag without the commercial declaration is incoherent.
  constraint tiktok_brand_flags_need_commercial check (
    is_commercial_content = true
    or (is_branded_content = false and is_your_brand = false)
  )
);

comment on table public.tiktok_video_metadata is
  'TikTok publishing settings for one platform variant. privacy_level is deliberately nullable: TikTok requires a value it returned for this creator, and an unaudited client is restricted to SELF_ONLY.';

drop trigger if exists tiktok_video_metadata_set_updated_at
  on public.tiktok_video_metadata;
create trigger tiktok_video_metadata_set_updated_at
before update on public.tiktok_video_metadata
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- tiktok_publish_sessions  (server-only)
-- ---------------------------------------------------------------------------
--
-- TikTok's flow is: initialise, upload chunks, then poll a separate status
-- endpoint using the `publish_id` it returned. The gap between the upload
-- finishing and the status confirming is where a worker can die — and TikTok
-- has already accepted the media by then.
--
-- This row is the reconciliation record. It is written the moment `publish_id`
-- is known, before a single byte is sent, so a retry asks TikTok what happened
-- rather than uploading a second copy.
--
-- The upload URL is a **bearer capability**: anyone holding it can push bytes
-- into that upload. It is encrypted at rest and the table is unreachable from
-- the browser.

create table if not exists public.tiktok_publish_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scheduled_post_id uuid not null
    references public.scheduled_posts (id) on delete cascade,

  idempotency_key text not null unique
    check (char_length(idempotency_key) between 16 and 200),

  -- TikTok's own tracking id for the whole lifecycle of this post.
  publish_id text not null check (char_length(publish_id) between 1 and 200),

  -- Which mode this session was opened in. A draft upload must never be
  -- reconciled as though it were a public post.
  delivery_mode text not null check (delivery_mode in ('direct_post', 'inbox')),

  -- Versioned AES-256-GCM envelope. Never a plaintext URL.
  encrypted_upload_url text
    check (encrypted_upload_url is null or char_length(encrypted_upload_url) <= 8000),

  video_size_bytes bigint check (video_size_bytes is null or video_size_bytes >= 0),
  chunk_size_bytes bigint check (chunk_size_bytes is null or chunk_size_bytes >= 0),
  total_chunk_count integer
    check (total_chunk_count is null or total_chunk_count between 1 and 1000),
  chunks_sent integer not null default 0 check (chunks_sent >= 0),

  -- Mirrors TikTok's documented publish statuses, mapped into our vocabulary.
  status text not null default 'initialised'
    check (
      status in (
        'initialised',
        'uploading',
        'processing',
        'published',
        'uploaded_to_draft',
        'failed',
        'expired'
      )
    ),

  -- TikTok's own id for the finished post. The only thing that proves a
  -- public post exists.
  external_post_id text
    check (external_post_id is null or char_length(external_post_id) <= 200),

  last_error_code text
    check (last_error_code is null or char_length(last_error_code) <= 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A published session must name the post. Without an id there is nothing to
  -- show for it, and `posted` must not follow.
  constraint tiktok_published_requires_post_id check (
    status <> 'published' or external_post_id is not null
  ),
  -- A draft is not a post. It must never carry a public post id.
  constraint tiktok_draft_has_no_post_id check (
    status <> 'uploaded_to_draft' or external_post_id is null
  ),
  -- An inbox session can never reach `published` — that state belongs to
  -- direct post alone.
  constraint tiktok_inbox_cannot_publish check (
    delivery_mode <> 'inbox' or status <> 'published'
  )
);

comment on table public.tiktok_publish_sessions is
  'TikTok upload sessions. Written before any byte is sent so a crashed worker reconciles rather than posting twice. RLS enabled with no policies: server-only, and the upload URL is a bearer capability.';

create index if not exists tiktok_sessions_post_idx
  on public.tiktok_publish_sessions (scheduled_post_id);

drop trigger if exists tiktok_publish_sessions_set_updated_at
  on public.tiktok_publish_sessions;
create trigger tiktok_publish_sessions_set_updated_at
before update on public.tiktok_publish_sessions
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log: TikTok actions
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
      'tiktok_manual_post_prepared'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.tiktok_video_metadata enable row level security;
alter table public.tiktok_publish_sessions enable row level security;

revoke all on public.tiktok_video_metadata from anon;
revoke all on public.tiktok_publish_sessions from anon;

-- Sessions get **no policies**, like the YouTube and Instagram session tables
-- they mirror. A browser that could write a publish_id could manufacture the
-- decision a retry makes about whether a post already exists.
revoke all on public.tiktok_publish_sessions from authenticated;

-- tiktok_video_metadata ------------------------------------------------------

drop policy if exists "Owners can read their TikTok metadata" on public.tiktok_video_metadata;
create policy "Owners can read their TikTok metadata"
on public.tiktok_video_metadata for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their TikTok metadata" on public.tiktok_video_metadata;
create policy "Owners can create their TikTok metadata"
on public.tiktok_video_metadata for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their TikTok metadata" on public.tiktok_video_metadata;
create policy "Owners can update their TikTok metadata"
on public.tiktok_video_metadata for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their TikTok metadata" on public.tiktok_video_metadata;
create policy "Owners can delete their TikTok metadata"
on public.tiktok_video_metadata for delete to authenticated
using ((select auth.uid()) = owner_id);
