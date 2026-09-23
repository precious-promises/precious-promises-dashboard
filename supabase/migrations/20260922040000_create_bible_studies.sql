-- Precious Promises Bible Study Master Specification.
-- Provider-independent canonical studies, saved revisions, human Scripture
-- verification and human approval. Nothing here schedules or publishes.

create table if not exists public.bible_studies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  topic_or_passage text not null check (char_length(trim(topic_or_passage)) between 1 and 500),
  translation text not null check (translation in ('BSB','KJV')),
  depth text not null check (depth in ('short','standard','deep')),
  audience text not null check (audience in ('seeker','new_believer','general_christian','mature_christian','teacher_preacher','apologetics')),
  emphasis text check (emphasis is null or char_length(emphasis) <= 1000),
  provider_requested text not null check (provider_requested in ('anthropic','openai')),
  current_revision_number integer not null default 0 check (current_revision_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bible_study_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  study_id uuid not null references public.bible_studies(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  request_fingerprint text not null check (char_length(request_fingerprint)=64),
  content_hash text not null check (char_length(content_hash)=64),
  provider text not null check (provider in ('anthropic','openai')),
  model text not null check (char_length(model) between 1 and 120),
  specification_version text not null check (char_length(specification_version) between 1 and 80),
  prompt_version text not null check (char_length(prompt_version) between 1 and 80),
  canonical_study jsonb not null,
  validation_report jsonb not null,
  generation_status text not null default 'completed' check (generation_status in ('completed','failed')),
  review_state text not null default 'draft' check (review_state in ('draft','ready_for_review','approved','rejected')),
  scripture_verification_status text not null default 'verification_required' check (scripture_verification_status in ('verification_required','manually_verified')),
  scripture_verified_at timestamptz,
  scripture_verified_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(study_id, revision_number),
  constraint bible_study_approval_requires_verified_scripture check (
    review_state <> 'approved'
    or (
      scripture_verification_status='manually_verified'
      and approved_at is not null
      and approved_by is not null
    )
  )
);

create index if not exists bible_studies_owner_idx
  on public.bible_studies(owner_id, updated_at desc);
create index if not exists bible_study_revisions_owner_idx
  on public.bible_study_revisions(owner_id, created_at desc);
create index if not exists bible_study_revisions_request_idx
  on public.bible_study_revisions(owner_id, request_fingerprint, created_at desc);
create index if not exists bible_study_revisions_study_idx
  on public.bible_study_revisions(study_id, revision_number desc);

drop trigger if exists bible_studies_set_updated_at on public.bible_studies;
create trigger bible_studies_set_updated_at
before update on public.bible_studies
for each row execute function public.handle_updated_at();

drop trigger if exists bible_study_revisions_set_updated_at on public.bible_study_revisions;
create trigger bible_study_revisions_set_updated_at
before update on public.bible_study_revisions
for each row execute function public.handle_updated_at();

alter table public.bible_studies enable row level security;
alter table public.bible_study_revisions enable row level security;

revoke all on public.bible_studies from anon;
revoke all on public.bible_study_revisions from anon;

drop policy if exists "Owners can read their Bible studies" on public.bible_studies;
create policy "Owners can read their Bible studies"
on public.bible_studies for select to authenticated
using ((select auth.uid())=owner_id);

drop policy if exists "Owners can create their Bible studies" on public.bible_studies;
create policy "Owners can create their Bible studies"
on public.bible_studies for insert to authenticated
with check ((select auth.uid())=owner_id);

drop policy if exists "Owners can update their Bible studies" on public.bible_studies;
create policy "Owners can update their Bible studies"
on public.bible_studies for update to authenticated
using ((select auth.uid())=owner_id)
with check ((select auth.uid())=owner_id);

drop policy if exists "Owners can delete their Bible studies" on public.bible_studies;
create policy "Owners can delete their Bible studies"
on public.bible_studies for delete to authenticated
using ((select auth.uid())=owner_id);

drop policy if exists "Owners can read their Bible Study revisions" on public.bible_study_revisions;
create policy "Owners can read their Bible Study revisions"
on public.bible_study_revisions for select to authenticated
using ((select auth.uid())=owner_id);

-- Revisions are immutable content records from the browser. Generation and
-- decision actions use trusted server code; owners can read but cannot forge
-- provider provenance or approval state.
revoke insert, update, delete on public.bible_study_revisions from authenticated;
