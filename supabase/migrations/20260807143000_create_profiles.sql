-- Profiles for the Precious Promises Content & Growth Dashboard.
--
-- One row per authenticated user, holding the presentation-layer identity that
-- does not belong in auth.users. The owner's Auth account is created manually
-- in Supabase (see docs/supabase-setup.md); this table does not create users.
--
-- The application never uses the service role key, so every statement it issues
-- against this table is subject to the policies below.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null or char_length(trim(display_name)) between 1 and 120
  ),
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Owner-facing profile for each authenticated user. Access is restricted to the row''s own user by RLS.';
comment on column public.profiles.id is
  'Matches auth.users.id. Deleting the auth user deletes the profile.';
comment on column public.profiles.role is
  'Authorisation role. Constrained to owner or admin.';

-- Keep updated_at honest rather than trusting the client to send it.
-- search_path is pinned so the function cannot be hijacked by a mutable path.
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Enabling RLS denies everything by default; each policy below re-opens exactly
-- one operation, for the authenticated role only, and only for the caller's own
-- row. There is deliberately no catch-all policy and no policy for `anon`.
--
-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once per
-- statement instead of once per row, per current Supabase guidance.

alter table public.profiles enable row level security;

-- Anonymous visitors have no business touching profiles at all. RLS already
-- denies them (they have no policy), but removing the grant makes that explicit
-- and survives someone later adding a permissive policy by mistake.
revoke all on public.profiles from anon;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

-- Insert is permitted only for the caller's own id, so a signed-in user can
-- create their profile row on first visit but cannot create one for anyone else.
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

-- USING controls which rows may be updated; WITH CHECK controls what they may
-- become. Both are required — without WITH CHECK a user could reassign their
-- row's id to another user.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- No DELETE policy: profiles are removed by the cascade from auth.users, not by
-- the application.
