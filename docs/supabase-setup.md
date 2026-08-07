# Supabase setup

> **Status: implemented.** The project exists, the `profiles` migration is
> applied, and Row Level Security is enforced. One manual step remains — see
> [Create the owner account](#create-the-owner-account).

## Project identity

| Field        | Value                                      |
| ------------ | ------------------------------------------ |
| Project name | `precious-promises-dashboard`              |
| Project ref  | `yrlnahnbwrtmljcbfjdg`                     |
| Region       | `eu-west-2` (London)                       |
| Postgres     | 17.6                                       |
| API URL      | `https://yrlnahnbwrtmljcbfjdg.supabase.co` |

Every remote operation must target this ref explicitly.

## Organisation versus project — an important distinction

This project sits inside the Supabase organisation **Genesis O.S**
(`opzfpwftfcggythyxvwc`). That needs stating plainly, because it looks like a
contradiction of the separation rule until you know what an organisation is.

| Layer                   | Shared with Genesis? | What it means                                             |
| ----------------------- | -------------------- | --------------------------------------------------------- |
| **Organisation**        | **Yes**              | Billing account, member list, org-level settings          |
| **Project**             | No                   | `precious-promises-dashboard` is its own project          |
| **Postgres database**   | No                   | Separate database, separate schema, separate data         |
| **Auth tenant / users** | No                   | Separate user pool; a Genesis account cannot sign in here |
| **API credentials**     | No                   | Its own URL, publishable key and JWT signing keys         |
| **Migrations**          | No                   | Only this repository's migrations run against it          |
| **RLS policies**        | No                   | Defined solely by this repository                         |

An organisation is a **billing and management container**, not a data boundary.
Nothing about sharing one gives this application access to Genesis data, or
Genesis access to this data.

**Genesis projects are never accessed by this application.** No Genesis project
has been opened, listed, queried or configured during setup, and no Genesis
credential appears anywhere in this repository.

If the organisation should be separated too, create a new Supabase organisation
in the dashboard and move the project into it. Nothing in this codebase depends
on the organisation.

## Local configuration

Copy the example file and fill in the two public values:

```bash
cp .env.example .env.local
```

```bash
APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://yrlnahnbwrtmljcbfjdg.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Retrieve the publishable key from the Supabase dashboard under
**Project Settings → API keys**, or with the CLI once authenticated.

`.env.local` is git-ignored. Never commit it.

### Why there is no service role key

`SUPABASE_SERVICE_ROLE_KEY` is deliberately **not** used anywhere in this
application, and is not needed to run it. That key bypasses Row Level Security
entirely — any code holding it can read and write every row belonging to every
user, and a single leak into a client bundle would expose the whole database.

The publishable key is the correct one for both browser and server code here:
it is safe to expose, and access is constrained by RLS and the caller's
session. `tests/unit/client-secret-boundary.test.ts` fails the build if a
service role reference ever appears in `src/`.

## Create the owner account

**This is the one manual step.** There is no public registration route, and
this repository will not invent credentials.

1. Open the Supabase dashboard for **`precious-promises-dashboard`**
   (ref `yrlnahnbwrtmljcbfjdg`) — check the project name before proceeding.
2. Go to **Authentication → Users**.
3. Click **Add user → Create new user**.
4. Enter Dave's email address and a strong password.
5. Tick **Auto Confirm User**, otherwise sign-in is refused until the address
   is confirmed by email.
6. Click **Create user**.

You can now sign in at `/login`.

### Optionally, add the profile row

The application works without one — see below — but to record the display name
and role, run this in **SQL Editor** after the account exists:

```sql
insert into public.profiles (id, display_name, role)
select id, 'Dave', 'owner'
from auth.users
where email = 'REPLACE_WITH_DAVES_EMAIL'
on conflict (id) do nothing;
```

The SQL Editor runs as a privileged role, so this is the one place a profile
row can be created before the owner has signed in. Afterwards the RLS insert
policy lets the signed-in owner create their own row from the application.

### The app is safe without a profile row

The dashboard reads identity from the Auth session (`auth.getUser()`), not from
`profiles`. A user who exists in Auth but has no profile row signs in normally
and sees the dashboard — there is no crash, no redirect loop, and no blank
screen. The profile table is groundwork for later blocks, not a dependency of
signing in.

## Database

### Applied migrations

| Migration                            | Contents                                                           |
| ------------------------------------ | ------------------------------------------------------------------ |
| `20260807143000_create_profiles.sql` | `profiles` table, `updated_at` trigger, RLS enable, three policies |

The migration is stored in `supabase/migrations/` and was applied to
`yrlnahnbwrtmljcbfjdg` through the authenticated Supabase connector. Supabase's
security advisor reports **no lints** against the result.

### Row Level Security on `profiles`

RLS is enabled, which denies everything by default. Three policies re-open
exactly one operation each, for the `authenticated` role only, and only for the
caller's own row:

| Operation | Policy                             | Condition                             |
| --------- | ---------------------------------- | ------------------------------------- |
| SELECT    | Users can read their own profile   | `(select auth.uid()) = id`            |
| INSERT    | Users can create their own profile | `with check (select auth.uid()) = id` |
| UPDATE    | Users can update their own profile | `using` **and** `with check`          |

- **No DELETE policy.** Profiles are removed by the cascade from
  `auth.users`, not by the application.
- **No `anon` policy**, and the `anon` grant is explicitly revoked. Anonymous
  visitors cannot read profiles under any circumstances.
- **No catch-all policy.** Every policy names a single operation and a single
  role.
- `auth.uid()` is wrapped in a scalar subquery so Postgres evaluates it once
  per statement rather than once per row.

UPDATE carries both `using` and `with check` on purpose: `using` decides which
rows may be updated, `with check` decides what they may become. Without the
latter, a user could reassign their row's `id` to somebody else's.

## CLI linking

`supabase init` has been run: `supabase/config.toml` records the project ref,
and `supabase/migrations/` holds the migration history.

`supabase link` has **not** been run. It requires a Personal Access Token,
which is account-wide and was deliberately not issued. Migrations are applied
through the authenticated connector against the explicit ref instead.

To link the CLI on your own machine:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref yrlnahnbwrtmljcbfjdg
```

Confirm the ref before running it. `supabase/.temp/` is git-ignored, so the
link is local to your machine.

## Safety checklist for remote commands

Before any command that writes to a remote database, confirm:

1. The project name is `precious-promises-dashboard`.
2. The project ref is `yrlnahnbwrtmljcbfjdg`.
3. The command targets that ref explicitly rather than a default.

If any of the three cannot be verified, stop.
