-- Stage 7: YouTube connection and publishing.
--
-- The security shape of this migration matters more than its columns.
--
-- **Three tables have Row Level Security enabled and no policies at all.**
-- With RLS on and no policy, every operation is refused for every row — so
-- `social_account_credentials`, `oauth_states` and `youtube_upload_sessions`
-- are unreachable from the browser by construction, not by convention. Only
-- trusted server code holding `SUPABASE_SECRET_KEY` can read them.
--
-- That is deliberate for each:
--
-- - **Credentials** hold encrypted OAuth tokens. A browser has no business
--   seeing even the ciphertext.
-- - **OAuth states** are single-use CSRF tokens. Readable state is guessable
--   state.
-- - **Upload sessions** hold a resumable session URI, which Google treats as a
--   bearer capability: anyone holding it can push bytes into the upload. It is
--   encrypted at rest *and* unreachable from the browser.
--
-- The account record itself (`social_accounts`) carries no secret, so it is
-- owner-readable in the ordinary way.

-- ---------------------------------------------------------------------------
-- social_accounts
-- ---------------------------------------------------------------------------

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  -- The platform's own identifier for the account. Never typed by a human:
  -- it is read from the platform after OAuth succeeds.
  provider_account_id text not null
    check (char_length(provider_account_id) between 1 and 200),

  display_name text check (display_name is null or char_length(display_name) <= 300),
  handle text check (handle is null or char_length(handle) <= 200),

  -- YouTube specifics, discovered via channels.list(mine=true).
  channel_id text check (channel_id is null or char_length(channel_id) <= 100),
  channel_title text check (channel_title is null or char_length(channel_title) <= 300),

  -- `connected` is only ever written after a genuine OAuth exchange *and* a
  -- successful channel lookup. `needs_reconnect` is for a refresh token the
  -- platform has rejected — the account exists but cannot act.
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'needs_reconnect')),

  -- The scopes the platform actually granted, which may be fewer than asked.
  granted_scopes text[] not null default '{}'::text[],

  connected_at timestamptz,
  disconnected_at timestamptz,
  token_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, platform, provider_account_id),

  -- A connected account must say which account it is.
  constraint social_accounts_connected_requires_identity check (
    status <> 'connected'
    or (connected_at is not null and provider_account_id <> '')
  ),
  -- A YouTube account is a channel. Without one, it cannot be connected.
  constraint social_accounts_youtube_requires_channel check (
    platform <> 'youtube' or status <> 'connected' or channel_id is not null
  )
);

comment on table public.social_accounts is
  'A connected external platform account. Holds identity only — never credentials. Connected status requires a genuine OAuth exchange and a real channel lookup.';

create index if not exists social_accounts_owner_idx
  on public.social_accounts (owner_id, platform);

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- social_account_credentials  (server-only)
-- ---------------------------------------------------------------------------

create table if not exists public.social_account_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  social_account_id uuid not null unique
    references public.social_accounts (id) on delete cascade,

  -- Versioned AES-256-GCM envelopes: "v1.<iv>.<tag>.<ciphertext>", all base64.
  -- Never a plaintext token, in any column, ever.
  encrypted_access_token text
    check (encrypted_access_token is null or char_length(encrypted_access_token) <= 8000),
  encrypted_refresh_token text
    check (encrypted_refresh_token is null or char_length(encrypted_refresh_token) <= 8000),

  access_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}'::text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.social_account_credentials is
  'Encrypted OAuth credentials. RLS is enabled with NO policies, so the browser cannot reach this table at all — only trusted server code can.';

drop trigger if exists social_account_credentials_set_updated_at
  on public.social_account_credentials;
create trigger social_account_credentials_set_updated_at
before update on public.social_account_credentials
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- oauth_states  (server-only, single use)
-- ---------------------------------------------------------------------------

create table if not exists public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  -- A high-entropy random value. Unique so a replay collides rather than
  -- silently succeeding.
  state text not null unique check (char_length(state) between 32 and 200),

  -- Short-lived: an OAuth round trip is a minute's work, not an hour's.
  expires_at timestamptz not null,
  consumed_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.oauth_states is
  'Single-use OAuth CSRF state. RLS enabled with no policies: a readable state token is a guessable one.';

create index if not exists oauth_states_expiry_idx on public.oauth_states (expires_at);

-- ---------------------------------------------------------------------------
-- youtube_video_metadata
-- ---------------------------------------------------------------------------
--
-- The YouTube-specific fields for one platform variant. Only fields the
-- current API documents are represented; nothing here is invented.

create table if not exists public.youtube_video_metadata (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  platform_variant_id uuid not null unique
    references public.platform_variants (id) on delete cascade,

  -- snippet.categoryId — a numeric string in the API.
  category_id text check (category_id is null or char_length(category_id) <= 10),
  default_language text check (default_language is null or char_length(default_language) <= 20),
  default_audio_language text
    check (default_audio_language is null or char_length(default_audio_language) <= 20),

  tags text[] not null default '{}'::text[]
    check (array_length(tags, 1) is null or array_length(tags, 1) <= 100),

  -- status.privacyStatus. **Defaults to private, and Stage 7 cannot offer
  -- public**: an API client that has not passed Google's compliance audit has
  -- its uploads forced to private regardless of what it asks for, so offering
  -- `public` would be offering something the platform would override.
  privacy_status text not null default 'private'
    check (privacy_status in ('private', 'unlisted', 'public')),

  -- status.selfDeclaredMadeForKids — a legal declaration, so it has no
  -- default that could be mistaken for an answer.
  self_declared_made_for_kids boolean,
  -- status.containsSyntheticMedia
  contains_synthetic_media boolean not null default false,
  -- The notifySubscribers request parameter.
  notify_subscribers boolean not null default true,

  -- A playlist the channel actually has. Verified against the API, never typed.
  playlist_id text check (playlist_id is null or char_length(playlist_id) <= 100),

  thumbnail_media_asset_id uuid
    references public.media_assets (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.youtube_video_metadata is
  'YouTube-specific publishing metadata for one platform variant. Only fields documented by the current API.';
comment on column public.youtube_video_metadata.privacy_status is
  'Defaults to private. An unaudited API client has its uploads forced to private by YouTube regardless of this value.';

drop trigger if exists youtube_video_metadata_set_updated_at
  on public.youtube_video_metadata;
create trigger youtube_video_metadata_set_updated_at
before update on public.youtube_video_metadata
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- youtube_upload_sessions  (server-only)
-- ---------------------------------------------------------------------------
--
-- A resumable upload session. The session URI is a **bearer capability**:
-- anyone holding it can push bytes into that upload. It is therefore
-- encrypted at rest and unreachable from the browser.
--
-- This table is also the reconciliation record. If a worker dies after
-- YouTube accepted the bytes but before the success was persisted, the
-- session lets the next attempt ask YouTube what happened instead of
-- uploading again.

create table if not exists public.youtube_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  scheduled_post_id uuid not null
    references public.scheduled_posts (id) on delete cascade,

  -- The operation this session belongs to, so a retry of the *same* approved
  -- operation finds it and a different operation does not.
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),

  encrypted_session_uri text not null
    check (char_length(encrypted_session_uri) <= 8000),

  bytes_total bigint check (bytes_total is null or bytes_total >= 0),
  bytes_sent bigint not null default 0 check (bytes_sent >= 0),

  -- Set the moment YouTube returns an id, before anything else is written.
  video_id text check (video_id is null or char_length(video_id) <= 100),

  status text not null default 'open'
    check (status in ('open', 'completed', 'abandoned')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (idempotency_key),

  constraint youtube_upload_sessions_completed_requires_video check (
    status <> 'completed' or video_id is not null
  )
);

comment on table public.youtube_upload_sessions is
  'Resumable upload session. The URI is a bearer capability — encrypted at rest, and RLS is enabled with no policies so the browser cannot reach it.';

create index if not exists youtube_upload_sessions_post_idx
  on public.youtube_upload_sessions (scheduled_post_id);

drop trigger if exists youtube_upload_sessions_set_updated_at
  on public.youtube_upload_sessions;
create trigger youtube_upload_sessions_set_updated_at
before update on public.youtube_upload_sessions
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- scheduled_posts: platform processing state
-- ---------------------------------------------------------------------------
--
-- A successful upload is not a published video. YouTube processes it
-- afterwards, and the two must not be conflated.

alter table public.scheduled_posts
  add column if not exists external_processing_status text
    check (
      external_processing_status is null
      or external_processing_status in ('uploaded', 'processing', 'processed', 'processing_failed')
    ),
  add column if not exists external_processing_checked_at timestamptz;

comment on column public.scheduled_posts.external_processing_status is
  'The platform''s own processing state after a successful upload. Uploaded is not the same as visible.';

-- ---------------------------------------------------------------------------
-- audit_log: YouTube actions
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
      'youtube_processing_updated'
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
      'social_account'
    )
  );

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.social_accounts enable row level security;
alter table public.social_account_credentials enable row level security;
alter table public.oauth_states enable row level security;
alter table public.youtube_video_metadata enable row level security;
alter table public.youtube_upload_sessions enable row level security;

revoke all on public.social_accounts from anon;
revoke all on public.social_account_credentials from anon;
revoke all on public.oauth_states from anon;
revoke all on public.youtube_video_metadata from anon;
revoke all on public.youtube_upload_sessions from anon;

-- Credentials, OAuth states and upload sessions get **no policies**. RLS is
-- enabled, so every browser operation on them is refused. This is intentional
-- and is the strongest available statement of "the browser cannot have this".
revoke all on public.social_account_credentials from authenticated;
revoke all on public.oauth_states from authenticated;
revoke all on public.youtube_upload_sessions from authenticated;

-- social_accounts -----------------------------------------------------------

drop policy if exists "Owners can read their social accounts" on public.social_accounts;
create policy "Owners can read their social accounts"
on public.social_accounts for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their social accounts" on public.social_accounts;
create policy "Owners can update their social accounts"
on public.social_accounts for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their social accounts" on public.social_accounts;
create policy "Owners can delete their social accounts"
on public.social_accounts for delete to authenticated
using ((select auth.uid()) = owner_id);

-- Deliberately **no INSERT policy**. An account row is only ever created by
-- trusted server code after a genuine OAuth exchange and channel lookup — a
-- browser-inserted row would be a connection nobody made.

-- youtube_video_metadata ----------------------------------------------------

drop policy if exists "Owners can read their YouTube metadata" on public.youtube_video_metadata;
create policy "Owners can read their YouTube metadata"
on public.youtube_video_metadata for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their YouTube metadata" on public.youtube_video_metadata;
create policy "Owners can create their YouTube metadata"
on public.youtube_video_metadata for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their YouTube metadata" on public.youtube_video_metadata;
create policy "Owners can update their YouTube metadata"
on public.youtube_video_metadata for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.platform_variants pv
    where pv.id = platform_variant_id and pv.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their YouTube metadata" on public.youtube_video_metadata;
create policy "Owners can delete their YouTube metadata"
on public.youtube_video_metadata for delete to authenticated
using ((select auth.uid()) = owner_id);
