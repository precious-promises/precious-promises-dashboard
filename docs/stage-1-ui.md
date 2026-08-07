# Stage 1 — dashboard shell

> **Status: implemented (UI architecture only).**
>
> Stage 1 built the premium interface shell. It added **no** product
> capability: no content models, no publishing, no scheduling, no analytics,
> no AI, and no platform integrations. Everything the interface shows about
> those areas is an honest empty or unavailable state.

## What exists

| Route         | Access        | State                                          |
| ------------- | ------------- | ---------------------------------------------- |
| `/`           | Public        | Landing page — product name and a sign-in link |
| `/login`      | Public        | Two-panel premium sign-in                      |
| `/dashboard`  | Authenticated | Full shell and dashboard home                  |
| `/api/health` | Public        | Unchanged from Stage 0                         |

## Layout

```
┌────────────┬──────────────────────────────────────────┐
│            │  TopBar  title · search · bell · owner   │
│  Sidebar   ├──────────────────────────────────────────┤
│  (lg+)     │                                          │
│            │  main#main-content                       │
│  brand     │    greeting                              │
│  nav       │    metrics ×4                            │
│  scripture │    upcoming | platforms                  │
│            │    pipeline                              │
│            │    quick actions | foundation            │
└────────────┴──────────────────────────────────────────┘
```

Below `lg` the sidebar is replaced by a drawer opened from the top bar.

## Navigation

All 19 approved areas live in `src/config/navigation.ts`, grouped as
Dashboard, Content, Create, Media, Publish, Grow and System.

**Availability is data, not styling.** Each item is either:

- `available` — has an `href`, renders as a `<Link>`; or
- `coming-soon` — has **no `href` at all**, renders as a non-focusable row
  marked `aria-disabled="true"` with "coming soon" in its accessible text.

That shape is deliberate. Because an unbuilt module has nowhere to point, it is
structurally impossible to ship a link to a route that does not exist — the type
carries the guarantee, not a code review. `navigation-config.test.ts` asserts
it, and a module becomes reachable only by gaining an `href`.

Only **Dashboard** is available in Stage 1.

## Responsive behaviour

| Breakpoint              | Navigation              | Layout                           |
| ----------------------- | ----------------------- | -------------------------------- |
| `< lg` (mobile, tablet) | Drawer from the top bar | Single column; cards stack       |
| `≥ lg` (desktop)        | Fixed 18rem sidebar     | Content beside the sidebar       |
| `≥ xl`                  | Fixed sidebar           | Two- and three-column card grids |

Mobile is an adaptation, not a shrink. The login page **drops** its brand panel
below `lg` rather than stacking it, because on a phone it would push the form
below the fold. An end-to-end test asserts the panel is hidden on a 390px
viewport and visible at 1440px, and that neither public page scrolls
horizontally at either size.

### The drawer

Built directly rather than pulled from a component library — the behaviour
needed is small and specific, and getting it right matters more than the
component count:

- Opens from an explicitly labelled trigger.
- Escape closes it; the backdrop is a real `<button>`, so it is operable
  without a pointer.
- Focus moves into the panel on open and returns to the trigger on close, so a
  keyboard user is never stranded on the page underneath.
- Body scroll is locked while open.
- Following a link closes it.

## Components

| Component          | Type       | Responsibility                                  |
| ------------------ | ---------- | ----------------------------------------------- |
| `DashboardShell`   | Server     | Sidebar + top bar + `<main>` frame              |
| `AppSidebar`       | Server     | Desktop sidebar                                 |
| `MobileSidebar`    | **Client** | Drawer, focus and keyboard handling             |
| `SidebarNav`       | Server     | The nav list, shared by both                    |
| `TopBar`           | Server     | Title, search shell, notifications shell, owner |
| `BrandMark`        | Server     | Product name block                              |
| `OwnerBadge`       | Server     | Private owner identity, initials avatar         |
| `ScripturePanel`   | Server     | The single branded Scripture detail             |
| `MetricCard`       | Server     | One compact metric                              |
| `WorkflowPipeline` | Server     | The seven-stage workflow diagram                |
| `QuickAction`      | Server     | A disabled action tile                          |
| `PlatformStatus`   | Server     | A platform and its connection state             |
| `SectionCard`      | Server     | Standard glass panel                            |
| `EmptyState`       | Server     | Panel-level empty state                         |
| `StatusBadge`      | Server     | Textual status marker                           |

**`MobileSidebar` is the only client component.** Everything else is a Server
Component, because nothing else needs browser state.

## Empty-state philosophy

The rule is simple: **the interface may not imply a capability the product does
not have.**

- **Metrics are real zeros.** No content tables exist, so every count is 0. Each
  card carries a note explaining why — "No content records yet", "Publishing not
  connected" — so a zero reads as a stage of construction, not a failure or a
  bad week.
- **Pipeline counts are structural.** The seven stages render the approved
  workflow with 0 in each, and the panel says in words that this is not a live
  queue.
- **Platforms say "Not connected"** because they are not connected. No OAuth
  flow exists and no credential is stored.
- **Unavailable controls are genuinely `disabled`**, not styled to look
  disabled. They stay out of the tab order and are announced as unavailable, so
  a keyboard or screen-reader user is not invited to activate something inert.
- **System foundation describes configuration, not health.** It says
  "Authentication foundation — Configured", never "Database — Online". Nothing
  on this page performs a network check, so nothing on it claims one.

No view fabricates views, subscribers, followers, revenue, watch time,
engagement, publish counts or history.

## Future module boundaries

A `coming-soon` area becomes real by:

1. Building its route under `src/app/`.
2. Adding `href` and flipping `status` to `available` in
   `src/config/navigation.ts`.
3. Replacing the relevant zero in the dashboard's `METRICS` array with a real
   query.

Metrics, quick actions, platforms and foundation entries are declared as arrays
at the top of `src/app/dashboard/page.tsx`, so wiring real data is a change to
those values rather than to any markup.

## Accessibility

- Skip link to `#main-content` as the first tab stop, asserted by a test.
- One `<h1>` per page; the dashboard's section headings run `h2`/`h3` without
  skipping levels.
- The navigation landmark is labelled; the active item carries
  `aria-current="page"`.
- Icon-only controls (menu, close, notifications, log out) have text
  alternatives.
- Focus is visible everywhere via `focus-visible` outlines in the highlight blue.
- Status is always carried in words; colour only reinforces it.
- `prefers-reduced-motion` collapses transitions to near-zero.

## Deferred

- **Authenticated visual testing.** The shell, drawer and dashboard cards cannot
  be exercised end to end without a real signed-in session, and no owner account
  exists yet. Creating a fake Supabase session would test the fake. Once the
  owner account exists (see [supabase-setup.md](./supabase-setup.md)), an
  authenticated Playwright project becomes possible.
- **Search and notifications**, which are shells only.
- **Every module except Dashboard.**
