# Security

> **Status: mostly planned.** Only the secret-handling rules are enforced in
> code today. Everything else records the approved requirements for the blocks
> that will implement them. Each section is marked accordingly.

## Secret handling — _implemented_

- Server secrets are read only through `src/lib/env/server.ts`. That module must
  never be imported by a Client Component.
- `src/lib/env/public.ts` exposes `NEXT_PUBLIC_*` values only, and never
  re-exports anything from the server module.
- There is no barrel module combining the two, so a careless import cannot pull
  secrets into the browser bundle.
- `.env.example` contains placeholder keys with **no values**. Real values live
  in untracked `.env` files locally and in the deployment platform's secret
  store in production.
- `.gitignore` ignores every `.env*` file, with a single explicit exception for
  `.env.example`.

## No secrets in logs or errors — _implemented for env validation_

Environment validation errors name the offending **variable** and describe what
is wrong with it. They never include the received value.

This matters because validation errors surface in server logs, crash reporters
and CI output — places where a leaked secret persists long after the incident
is resolved. `tests/unit/env.test.ts` asserts this behaviour directly.

The same rule applies everywhere else _(planned)_: no tokens, keys, or
credentials in log lines, error messages, or telemetry.

## OAuth _(planned)_

- **State validation.** Every OAuth authorisation request carries a
  cryptographically random `state` value, bound to the initiating session and
  verified on callback. Mismatched or missing state is rejected. This is the
  defence against CSRF on the connect flow.
- **Redirect URIs** are registered per platform and validated as http(s) URLs by
  the environment schema.
- **Server-only tokens.** Access and refresh tokens are held server-side and
  never sent to the browser, embedded in HTML, or exposed through an API
  response.
- **Token encryption.** Tokens are encrypted at rest using a key supplied via
  `TOKEN_ENCRYPTION_KEY`, so a database disclosure does not by itself yield
  usable platform credentials.
- **Least privilege.** Request the narrowest scopes that accomplish the task.
  Do not request write scopes for read-only features.
- **Revocation and disconnect.** Disconnecting an account revokes the token with
  the upstream platform where the platform supports it, and deletes the stored
  credential either way. Disconnect must not leave usable credentials behind.

## Access control _(planned)_

- **Ownership checks** on every read and write. A request may only touch records
  belonging to the authenticated owner. This is enforced in application code
  regardless of what the database allows.
- **Row Level Security.** Supabase RLS policies enforce the same constraint at
  the database level, so a bug in application code cannot widen access. Defence
  in depth: both layers, not one.

## Input and request handling _(planned)_

- **File validation.** Uploads are validated for type, size and content before
  being stored or processed. Do not trust a client-supplied MIME type or
  filename extension.
- **Request limits.** Rate limits on authentication, OAuth callbacks, upload
  endpoints and publish triggers. Body size limits on upload routes.

## Auditability _(planned)_

- **Audit logs** record security-relevant actions: sign-in, account connect and
  disconnect, approval and re-approval, publish attempts, and destructive
  operations. See `AuditLog` in [database-plan.md](./database-plan.md).
- Audit records capture who, what, and when — never the secret values involved.

## Publishing safety _(planned)_

- **Human approval before publishing.** No content reaches an external platform
  without explicit approval by the owner. There is no automatic-publish path.
- **Editing approved content invalidates approval.** Changing media, Scripture,
  captions, metadata or thumbnails returns the item to an unapproved state. See
  [state-machines.md](./state-machines.md).
- **Never fake a successful publish.** If a publish did not genuinely reach the
  platform, it is recorded as a failure. A completed code path is not evidence
  of a completed publish.
