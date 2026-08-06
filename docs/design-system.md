# Design system

> **Status: planned.** The approved visual direction is recorded here. The
> current interface is a placeholder homepage on default Tailwind styling — none
> of the palette, components or states below are built yet.

## Visual direction

The look is dark, calm and reverent — closer to a private studio than a
consumer analytics product. Restraint is the point: the interface should recede
so that content and Scripture carry the attention.

### Palette

| Role       | Direction                                                      |
| ---------- | -------------------------------------------------------------- |
| Background | Near-black navy — the base surface for every screen            |
| Panels     | Deep sapphire — raised surfaces sitting above the background   |
| Highlights | Cool blue — selection, focus, active state, interactive accent |
| Typography | Clean white — primary text, with softened tints for secondary  |
| Accents    | Restrained gold — sparingly, for emphasis and moments of note  |

Gold is an accent, not a theme. It marks significance; it does not decorate. If
gold appears in several places on one screen, it has stopped doing its job.

### Surfaces

- **Glass-style panels** — subtle translucency and blur over the navy base.
- **Fine borders** — hairline separations rather than heavy rules.
- **Soft shadows** — depth through diffusion, not hard drop shadows.

The combination should read as layered depth, not as ornament.

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

## Not yet decided

- Typeface selection
- Exact colour values and the token naming scheme
- Component library approach — bespoke versus a headless primitive library
- Spacing scale and grid definition

These are settled in the block that implements the interface, against the
direction above.
