# Design system

> **Status: implemented in Stage 1.** The palette, surfaces, layout and
> accessibility rules below are built. See [stage-1-ui.md](./stage-1-ui.md) for
> the component inventory. Typography is still the system stack — see
> [Not yet decided](#not-yet-decided).

## Visual direction

The look is dark, calm and reverent — closer to a private studio than a
consumer analytics product. Restraint is the point: the interface should recede
so that content and Scripture carry the attention.

### Palette

Implemented as CSS custom properties in `src/app/globals.css`, exposed to
Tailwind through `@theme inline`.

| Role            | Token            | Value                       |
| --------------- | ---------------- | --------------------------- |
| Page background | `canvas`         | `#070b16` — near-black navy |
| Deepest ink     | `ink`            | `#05070f`                   |
| Panels          | `panel`          | `#0c142a` — deep sapphire   |
| Raised panels   | `panel-raised`   | `#111b36`                   |
| Hover surface   | `panel-hover`    | `#162243`                   |
| Hairline border | `edge`           | `#1e2b4d`                   |
| Stronger border | `edge-strong`    | `#2b3b63`                   |
| Primary text    | `ink-primary`    | `#f4f7fc`                   |
| Secondary text  | `ink-secondary`  | `#9fb0cd`                   |
| Muted text      | `ink-muted`      | `#6c7f9f`                   |
| Highlight       | `highlight`      | `#4d8df7` — cool blue       |
| Highlight hover | `highlight-soft` | `#7aabff`                   |
| Accent          | `gold`           | `#c9a961` — restrained      |
| Accent dim      | `gold-dim`       | `#8a7440`                   |

There is no light theme. The product is a single dark workspace, so the palette
is defined once rather than duplicated under a colour-scheme query.

Gold is an accent, not a theme. It marks significance; it does not decorate. If
gold appears in several places on one screen, it has stopped doing its job.

### Surfaces

- **Glass-style panels** — `.pp-glass` mixes the panel colour to 78% opacity
  over a 12px backdrop blur.
- **Fine borders** — one-pixel `edge` separations rather than heavy rules.
- **Soft shadows** — a tight contact shadow plus a wide diffuse one.
- **Ambient wash** — `.pp-ambient` lays two low-opacity radial gradients (blue
  top-left, gold top-right) behind the app. Pure CSS, so it never enters the
  accessibility tree or the tab order.

The combination should read as layered depth, not as ornament.

## Long-term visual target — the Command Centre hybrid

**Locked direction.** The approved Precious Promises Command Centre hybrid is
the long-term visual target for the product. Stage 1's shell is the foundation
it grows from; it is **not** to be redesigned from scratch, and no stage should
restart the visual language.

The approved hierarchy, in order of precedence:

| Rank | Source    | Contributes                          |
| ---- | --------- | ------------------------------------ |
| 1    | Concept 4 | Premium cleanliness — the foundation |
| 2    | Concept 5 | Workflow depth                       |
| 3    | Concept 3 | Creator-studio tools                 |
| 4    | Concept 1 | Scheduling structure                 |
| 5    | Concept 2 | Analytics depth                      |

Where two concepts disagree, the higher rank wins. Concept 4's cleanliness is
the floor: workflow, tooling, scheduling and analytics are added **within** it,
never at its expense.

### Structural rule: command centre versus specialist tools

- **`/dashboard` is the command centre.** It reports the state of the whole
  operation and routes the owner to where the work happens. It does not become
  an editing surface.
- **Specialist editing tools live on their own dedicated pages** —
  `/dashboard/scripture`, `/dashboard/scripts`, `/dashboard/captions`, and the
  studios that follow them. Each is a full working surface, reached from the
  command centre rather than embedded in it.

This split is the reason the studios were built as separate routes in Stage 3
rather than as panels on the dashboard.

### How the studios already fit

Scripture Studio, Script Studio and Caption Studio are built from the shared
system rather than styled independently:

- Each renders inside `DashboardShell`, so chrome, navigation and spacing are
  the shell's, not the page's.
- Each composes the shared primitives in `src/components/ui/` — `SectionCard`,
  `EmptyState`, `StatusBadge`.
- **None of them contains a hardcoded colour.** Every colour comes from the
  `@theme inline` tokens above, so a change to the palette moves the studios
  with it.

That is what makes the Command Centre hybrid reachable by refinement instead of
rewrite: the studios have no private visual language to unpick.

### What is not yet specified

The concepts themselves — the actual layouts, compositions and screens of
Concepts 1–5 — are **not recorded in this repository**. Only the hierarchy
above is. Nothing in the codebase should claim to implement a concept's visual
detail until that detail has been supplied and written down here; inventing it
would be inventing an approved design.

## Layout

- **Desktop-first responsive.** The primary working context is a desktop
  workspace: review queues, media, scheduling and analytics side by side.
- **Mobile navigation adaptation.** Mobile is a genuine adaptation — navigation
  collapses to a mobile-appropriate pattern and dense tables reflow. It is not a
  narrow desktop layout, and it is not an afterthought.

## Accessibility

Accessibility is a requirement of the design, not a later audit.

- **Accessible contrast.** Text and meaningful UI must meet WCAG AA contrast
  against its actual background. A dark palette with gold accents makes this
  easy to get wrong — verify measured contrast, do not judge by eye.
- **A skip link** is the first tab stop on every page, asserted by an
  end-to-end test.
- **Keyboard navigation.** Every interactive element is reachable and operable
  by keyboard, in a sensible order, with a clearly visible focus indicator. The
  cool-blue highlight is the focus colour.
- Do not convey meaning through colour alone — pair it with text or an icon.

## Interface states

Every view that loads or mutates data specifies four states, designed rather
than defaulted:

| State       | Requirement                                                       |
| ----------- | ----------------------------------------------------------------- |
| **Loading** | Structural placeholder, not a bare spinner where layout is known. |
| **Empty**   | Explains what belongs here and the action that fills it.          |
| **Success** | Confirms what happened, specifically enough to be trusted.        |
| **Error**   | Says what failed and what to do next. Never exposes internals.    |

Error states follow [security.md](./security.md): no secrets, no stack traces,
no infrastructure detail in anything a user can see.

Publishing and approval need particular care. A success state must reflect a
confirmed outcome — the interface must never present a publish as successful
when it was not.

## Identity

- **Dave is shown privately as Founder & Creator.** The attribution appears in
  the owner's private workspace. It is not public-facing chrome.
- **No placeholder identities.** Never introduce fake people — no "Sarah
  Johnson", no "Steve Banks", no invented testimonials, avatars or team members.
  Where sample data is genuinely needed, it must be obviously synthetic and
  clearly labelled.
- **Focus remains on Precious Promises and God's Word.** The interface serves
  the content. It does not compete with it, and it does not turn Scripture into
  decoration.

## Component library

**No component library was adopted.** Stage 1 uses `lucide-react` for icons and
`clsx` + `tailwind-merge` for class composition, with the handful of primitives
built directly in `src/components/ui/`.

shadcn/ui was considered and declined. Its value here would have been Radix
primitives for the mobile drawer, but its initialiser also rewrites
`globals.css` with its own neutral theme — which is precisely the layer this
product defines itself. The drawer that needed building is about seventy lines
of focus and keyboard handling, and owning it outright was cheaper than
overriding a theme to get it. Revisit if a genuinely hard primitive is needed —
a combobox, a date picker, a virtualised table.

## Not yet decided

- **Typeface.** Still the system stack. A licensed display face for headings is
  the obvious next refinement.
- **Spacing scale** beyond Tailwind's defaults.
- **Motion vocabulary** — Stage 1 uses only short colour transitions.
