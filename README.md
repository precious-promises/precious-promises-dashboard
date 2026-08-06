# Precious Promises Content & Growth Dashboard

Promises of God.

Internal content and growth dashboard for Precious Promises.
Owner: Dave — Founder & Creator.

> This project is separate from the Precious Promises Bible app.

## Status

**Stage 0 · Block 1 — application scaffold.**

Currently a bare Next.js application with a placeholder homepage. No database,
no authentication, and no third-party integrations yet.

## Tech stack

| Concern         | Choice                   |
| --------------- | ------------------------ |
| Framework       | Next.js (App Router)     |
| Language        | TypeScript (strict mode) |
| Styling         | Tailwind CSS             |
| Linting         | ESLint                   |
| Formatting      | Prettier                 |
| Package manager | pnpm                     |

## Requirements

- Node.js 20.9 or newer
- pnpm (the repository pins its version via `packageManager`; run
  `corepack enable` to have it managed automatically)

## Getting started

```bash
pnpm install
pnpm dev
```

The app runs at http://localhost:3000.

## Scripts

| Script              | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm dev`          | Start the development server              |
| `pnpm build`        | Create a production build                 |
| `pnpm start`        | Serve a production build                  |
| `pnpm lint`         | Run ESLint                                |
| `pnpm typecheck`    | `next typegen && tsc --noEmit`            |
| `pnpm format`       | Format the repository with Prettier       |
| `pnpm format:check` | Verify formatting without writing changes |

## Project structure

```
src/
  app/
    layout.tsx    Root layout
    page.tsx      Placeholder homepage
    globals.css   Tailwind entry point and theme tokens
```
