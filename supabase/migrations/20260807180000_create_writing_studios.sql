-- Stage 3: script revisions and platform variants.
--
-- Two tables supporting the writing half of the content workflow.
--
-- Note what is *absent* from both: any Scripture column. Scripture lives on
-- content_items and nowhere else. A script revision holds the hook,
-- explanation, declaration, prayer and outro — the words a human wrote — and a
-- platform variant holds captions and metadata. Neither can carry a verse, so
-- neither can alter one, and the separation is structural rather than a
-- convention someone has to remember.

-- ---------------------------------------------------------------------------
-- script_revisions
-- ---------------------------------------------------------------------------
--
-- Append-only by design. Editing a script writes a new revision; nothing
-- overwrites an earlier one. Scripts are the record of what was actually
-- written and when, and a silently-replaced revision destroys that record.

create table if not exists public.script_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null
    references public.content_items (id) on delete cascade,

  revision_number integer not null check (revision_number >= 1),

  -- The written sections. Declaration and prayer are deliberately separate
  -- columns from one another and from Scripture: they are distinct content
  -- types and must stay distinguishable in the data, not merged into prose.
  hook text check (hook is null or char_length(hook) <= 5000),
  explanation text check (explanation is null or char_length(explanation) <= 20000),
  declaration text check (declaration is null or char_length(declaration) <= 10000),
  prayer text check (prayer is null or char_length(prayer) <= 10000),
  outro text check (outro is null or char_length(outro) <= 5000),
  notes text check (notes is null or char_length(notes) <= 10000),

  created_at timestamptz not null default now(),

  unique (content_item_id, revision_number)
);

comment on table public.script_revisions is
  'Append-only script history for a content item. Holds written prose only — never Scripture, which lives on content_items.';
comment on column public.script_revisions.revision_number is
  'Monotonic per content item, starting at 1. Editing creates a new revision rather than replacing one.';
comment on column public.script_revisions.declaration is
  'A declaration written by the owner. Not Scripture, and must never be presented as Scripture.';

create index if not exists script_revisions_item_revision_idx
  on public.script_revisions (content_item_id, revision_number desc);
create index if not exists script_revisions_owner_idx
  on public.script_revisions (owner_id);

-- ---------------------------------------------------------------------------
-- platform_variants
-- ---------------------------------------------------------------------------

create table if not exists public.platform_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  content_item_id uuid not null
    references public.content_items (id) on delete cascade,

  platform text not null check (platform in ('youtube', 'instagram', 'tiktok')),

  variant_type text not null check (
    variant_type in (
      'youtube_short',
      'youtube_video',
      'instagram_reel',
      'instagram_image',
      'instagram_carousel',
      'tiktok_video'
    )
  ),

  title text check (title is null or char_length(title) <= 300),
  caption text check (caption is null or char_length(caption) <= 5000),
  description text check (description is null or char_length(description) <= 10000),

  -- A text array rather than a delimited string, so a hashtag containing a
  -- separator cannot corrupt the list on the way in or out.
  hashtags text[] not null default '{}'::text[]
    check (array_length(hashtags, 1) is null or array_length(hashtags, 1) <= 60),

  first_comment text check (first_comment is null or char_length(first_comment) <= 3000),
  cta text check (cta is null or char_length(cta) <= 500),
  thumbnail_text text check (thumbnail_text is null or char_length(thumbnail_text) <= 200),

  -- Stage 3 covers drafting only. `approved` and `rejected` belong to the
  -- approval stage, and are omitted so the interface cannot claim a decision
  -- no system has made.
  review_state text not null default 'draft'
    check (review_state in ('draft', 'ready_for_review')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One variant of a given type per content item.
  unique (content_item_id, platform, variant_type),

  -- A variant type must belong to its platform. Without this an
  -- instagram_reel could be filed under youtube and would then be published
  -- to the wrong place by a future integration.
  constraint platform_variants_type_matches_platform check (
    (platform = 'youtube' and variant_type in ('youtube_short', 'youtube_video'))
    or (platform = 'instagram' and variant_type in
        ('instagram_reel', 'instagram_image', 'instagram_carousel'))
    or (platform = 'tiktok' and variant_type = 'tiktok_video')
  )
);

comment on table public.platform_variants is
  'Per-platform caption and metadata draft for a content item. Drafting only — nothing here publishes.';
comment on column public.platform_variants.review_state is
  'draft | ready_for_review. Marking ready for review publishes nothing; approval is a later stage.';

create index if not exists platform_variants_item_idx
  on public.platform_variants (content_item_id, platform);
create index if not exists platform_variants_owner_idx
  on public.platform_variants (owner_id);

drop trigger if exists platform_variants_set_updated_at on public.platform_variants;
create trigger platform_variants_set_updated_at
before update on public.platform_variants
for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Both tables carry owner_id *and* reference a content item. Ownership of the
-- row alone is not enough: writes must also prove the parent content item
-- belongs to the same caller, otherwise a user could attach a script or a
-- caption to somebody else's content.

alter table public.script_revisions enable row level security;
alter table public.platform_variants enable row level security;

revoke all on public.script_revisions from anon;
revoke all on public.platform_variants from anon;

-- script_revisions ---------------------------------------------------------

drop policy if exists "Owners can read their script revisions" on public.script_revisions;
create policy "Owners can read their script revisions"
on public.script_revisions for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their script revisions" on public.script_revisions;
create policy "Owners can create their script revisions"
on public.script_revisions for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

-- UPDATE exists so a mistyped note can be corrected, but the history itself is
-- protected by the application always inserting rather than updating.
drop policy if exists "Owners can update their script revisions" on public.script_revisions;
create policy "Owners can update their script revisions"
on public.script_revisions for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their script revisions" on public.script_revisions;
create policy "Owners can delete their script revisions"
on public.script_revisions for delete to authenticated
using ((select auth.uid()) = owner_id);

-- platform_variants --------------------------------------------------------

drop policy if exists "Owners can read their platform variants" on public.platform_variants;
create policy "Owners can read their platform variants"
on public.platform_variants for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can create their platform variants" on public.platform_variants;
create policy "Owners can create their platform variants"
on public.platform_variants for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update their platform variants" on public.platform_variants;
create policy "Owners can update their platform variants"
on public.platform_variants for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.content_items ci
    where ci.id = content_item_id and ci.owner_id = (select auth.uid())
  )
);

drop policy if exists "Owners can delete their platform variants" on public.platform_variants;
create policy "Owners can delete their platform variants"
on public.platform_variants for delete to authenticated
using ((select auth.uid()) = owner_id);
