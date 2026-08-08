# Stage 4 — Video Creation Studio

> **Status: the editor is real; rendering is not.** Projects, scenes, media
> slots, the timeline and the browser preview all work against the live
> database. **No video file is produced by this application.** Server rendering
> is designed and documented below, and deliberately not connected.
>
> **Not implemented:** ElevenLabs, Google Drive OAuth, YouTube/Instagram/TikTok
> OAuth, AI generation, scheduling, approval execution, analytics.

## What Stage 4 added

| Route                   | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `/dashboard/video`      | Video projects, and creating one from an item |
| `/dashboard/video/[id]` | The editor                                    |

Navigation now has **seven** available areas. The other 12 remain unbuilt and
carry no `href`.

## Rendering architecture

This section is the research the stage was asked for, and the decision it led
to. It was written against the current documentation at the time of
implementation; the constraints below change, and should be re-checked before
the renderer is built.

### The question

Where does a render run — and can it run inside this Next.js application?

### Findings

**Remotion cannot bundle inside a Next.js route.** Remotion's own server-side
rendering documentation states that `@remotion/bundler` cannot be used in a
Next.js API route, because Remotion's webpack instance conflicts with Next's.
Their recommended paths for a Next.js app are Remotion Lambda, or a separate
deployment that owns the render.

**A renderer needs binaries a serverless function does not have.**
`@remotion/renderer` drives a headless browser — Remotion pins and installs its
own Chrome Headless Shell, which on Linux additionally needs a set of shared
libraries — and ships its own `ffmpeg`/`ffprobe` binaries. That is a container
image, not a function bundle.

**Function duration is a hard ceiling.** Vercel functions run up to 300s on
Hobby and up to 800s on Pro/Enterprise with Fluid Compute (1800s in beta,
configured per function via `export const maxDuration`). A render of a
several-minute piece can exceed that, and it would hold an HTTP request open
for the whole time. Vercel's own guidance for work of this shape is to move it
off the request path.

**FFmpeg alone is the wrong tool for this product's text.** The `drawtext`
filter has no word wrapping (the arithmetic is manual), no simple outline (a
second composited `drawtext` pass), and long filter graphs become both slow and
awkward. Precious Promises videos are mostly styled, animated typography over
media — exactly what `drawtext` is worst at, and what a browser is best at.

**Licensing is a real input, not a footnote.** Remotion is free for individuals
and for-profit organisations up to three people; at four or more a paid company
licence is required. Precious Promises is a single-owner operation today, so it
falls inside the free tier — but this is a headcount question that must be
re-checked before deployment, not a permanent property of the project.

### Recommendation

**Compose with Remotion. Execute in a worker. Never in the request path.**

```
Browser (this app)          Postgres                 Worker (not deployed)
──────────────────          ────────                 ─────────────────────
edit scenes ───────────────▶ video_projects
                             video_scenes
preview in the DOM
                                  │
"Request a render" ──────────▶ render_jobs (queued)
                                  │                   picks up a queued job
                                  │◀───────────────── marks it `rendering`
                                  │                   renders with Remotion
                                  │                     (Chrome Headless Shell
                                  │                      + FFmpeg, in a container)
                                  │◀───────────────── writes the output asset,
                                  │                   marks it `completed`
render status is read from the job row
```

Why this shape:

- The **preview and the renderer share a model, not a codebase**. The preview
  is DOM; the renderer would be Remotion's React. Both read the same scenes,
  the same durations and the same presets, so what the owner arranges is what a
  renderer is asked for.
- The worker owns the binaries and the wall-clock. Nothing in this application
  waits for a render.
- **The database is the only channel for completion.** The application never
  writes `completed`; only something that produced a file can.

Remotion Lambda is the alternative execution target with the same job model —
lower operational burden, higher per-render cost, and the same seam either way.
The choice can be deferred because `RenderProvider` does not depend on it.

### What Stage 4 built instead of a renderer

- Real editor and project state, in Postgres
- A real browser preview
- The render job model, with its state machine
- `RenderProvider` — the adapter interface a renderer will implement

`getRenderProvider()` returns **`null`**, deliberately, and not a stub. A stub
returning plausible values would be indistinguishable from a working renderer
at the call site. Callers must handle the absence, which is what makes
"rendering is not connected" impossible to forget.

## Database

`supabase/migrations/20260808200000_create_video_studio.sql`, applied to
`precious-promises-dashboard` (`yrlnahnbwrtmljcbfjdg`).

### `video_projects`

`content_item_id`, `owner_id`, `name`, `aspect_ratio` (`9:16` / `16:9` /
`1:1`), `duration_estimate_seconds`, `status`, `current_revision`, timestamps.

`duration_estimate_seconds` is **derived** from the scene durations on every
change, never typed in, so it cannot disagree with the timeline. It is named an
estimate because it describes a composition, not a measured file.

`current_revision` increments whenever the scenes change, so a render job
records the composition it was actually asked to render rather than whatever
the project looks like later.

### `video_scenes`

`scene_order` (unique per project), `scene_type`, `text_source`,
`text_content`, `media_asset_id`, `duration_seconds`, `transition`,
`text_position`, `text_align`, `text_animation`.

Three check constraints carry the Scripture rule:

| Constraint                                    | Effect                                             |
| --------------------------------------------- | -------------------------------------------------- |
| `video_scenes_scripture_is_referenced`        | A Scripture scene must reference, and hold no text |
| `video_scenes_only_scripture_reads_scripture` | Nothing but a Scripture scene may read the verse   |
| `video_scenes_referenced_text_is_not_copied`  | Script-sourced text is not stored a second time    |

### `production_assets`

The project-level slots: background video, background image, background audio,
voiceover, logo, caption track. `unique (project_id, role)` — one asset per
slot, because two background tracks is a mixing decision the product has not
made and silently keeping both would surprise whoever renders it.

A slot references a row in `media_assets`. **No storage provider is connected**,
so attaching an asset records an intent; no file is fetched or played.

### `render_jobs`

`status` (`queued`, `rendering`, `completed`, `failed`, `cancelled`),
`provider`, `project_revision`, `failure_reason`, `output_media_asset_id`,
timestamps.

Three constraints make a fabricated success impossible:

```sql
constraint render_jobs_completed_requires_output check (
  status <> 'completed' or output_media_asset_id is not null)
constraint render_jobs_failed_requires_reason check (
  status <> 'failed' or failure_reason is not null)
constraint render_jobs_none_provider_cannot_complete check (
  provider <> 'none' or status <> 'completed')
```

A code path that ran to the end without producing a file **cannot** be recorded
as a finished render. That is the project's publishing rule applied to
rendering, enforced by the database rather than by discipline.

## Row Level Security

All four tables: RLS enabled, `anon` revoked, **16 policies** — one per
operation per table, `authenticated` only. **Security advisor: no lints.**

Every write proves the **parent** belongs to the caller as well as the row:
scenes, slots and jobs check `video_projects`; projects check `content_items`.
Slot writes additionally require ownership of the media asset, so a user cannot
attach somebody else's file and read its metadata back through the join.

## Scripture safety

**A verse is never copied into a scene.** A Scripture scene stores a reference
and nothing else; the verse is read from `content_items` every time it is
previewed. There is no editable field anywhere in the studio that holds
Scripture, so the studio structurally cannot rewrite one.

The existing rule is unchanged: editing a verified reference or text in the
Content Library still moves the item to `verification_required`.

**Scripture and prose are different shapes, not a flag.** `resolveScene`
returns a discriminated union — `{ kind: "scripture", reference, translation,
verificationStatus, text }` or `{ kind: "prose", sceneType, text, referenced }`.
Prose carries no reference and no translation, so there is nothing for a
renderer to mistake for a citation. Only the `scripture` branch draws a
`blockquote` and a `figcaption`; a declaration and a prayer are drawn as
labelled prose. Tests assert both halves.

## The editor

Four regions on laptop widths and up:

| Region | Contents                                           |
| ------ | -------------------------------------------------- |
| Top    | Project name, format, status, save                 |
| Left   | Layers, the read-only Scripture panel, media slots |
| Centre | Preview canvas, then the timeline                  |
| Right  | Selected scene inspector, then render status       |

**The selected scene lives in the URL** (`?scene=…`), not in client state, so
the editor renders on the server, survives a reload, and can be linked to. The
only Client Components are the preview player and the two forms that need
field-level errors.

### Preview

A real preview of layout and timing, drawn in the DOM: position, alignment,
animation preset, scene order and duration, played through on the real
durations. It produces no file, runs no encoder and plays no audio, and the
panel says so.

### Trim and split

**"Trim" means how long a scene is on screen** — it does not cut a media file.
The studio references assets whose bytes live elsewhere and no transcoding
exists. Split halves a scene's duration into two scenes, and refuses when the
halves would fall below the 0.5s minimum rather than writing a value the
database rejects.

### Mobile

A **management view**, not a shrunken editor: format, status, estimated length,
the scene list and which slots are filled. A four-region editor with a timeline
cannot be operated with a thumb, and a miniature version would look usable
without being usable. It renders on the server alongside the editor and is
swapped by CSS, so neither depends on JavaScript. A test asserts the mobile view
contains no form controls at all.

## Provider seams left for later

| Seam                       | State                                              |
| -------------------------- | -------------------------------------------------- |
| `RenderProvider`           | Interface only; `getRenderProvider()` → `null`     |
| `StorageAdapter` (Stage 2) | Interface only; no Drive integration               |
| Voiceover slot             | Storage for a file you supply; no speech synthesis |
| Caption track slot         | Storage for a file you supply; no transcription    |

None of these has an implementation, and none has a stub.

## Testing

**314 unit and component tests, 13 Playwright tests.**

New suites: `video-schema.test.ts`, `video-scenes.test.ts`,
`render-jobs.test.ts`, `video-components.test.tsx`.

Covered: project and scene schemas, all three aspect ratios, duration bounds
and rounding, scene ordering, moving, removal, trim and split, ownership fields
absent from every schema, the Scripture layer rules in both directions, the
render state machine, the refusal to render, the database constraints that
forbid a fabricated success, navigation activation, editor component rendering,
and the anonymous redirect for `/dashboard/video`.

Three real defects were found by these tests during the stage and fixed: a
`moveScene` that re-sorted its own swap away, and two schemas that rejected an
optional field the form simply omitted.

### Deferred: authenticated end-to-end testing

**Still deferred pending the owner Supabase Auth account.** The project has no
`auth.users` rows, so no session can be established and the write paths cannot
be exercised end to end against the live database.

Unverified end to end: create project → add scenes → reorder → save → request a
render, against real rows.

Verified anonymously: all seven protected routes redirect to `/login`.

This is a deferral, not a failure.

## Not built in Stage 4

- Server rendering — designed above, not connected
- ElevenLabs, or any speech synthesis
- Google Drive OAuth, or any file transfer
- Platform OAuth, publishing and scheduling
- AI generation of any kind
- Approval execution
- Analytics
