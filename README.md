# Company24 — AI Business OS

AI-операционная система которая ведёт бизнес 24/7. HR-модуль для автоматизации найма.

## Stack

- Next.js 16.1.6 + TypeScript
- PostgreSQL 16 + Drizzle ORM
- Tailwind CSS v4 + shadcn/ui
- Anthropic Claude (Sonnet 4.6 executor, Haiku filters)
- PM2 on Ubuntu 24 VPS (5.42.125.91)
- pnpm package manager

## Core Features

- **AI Chatbot** — 4-layer secure chatbot with candidates (executor + pre/post filters + watcher)
- **Funnel Builder** — visual drag-and-drop with 17 blocks and 3 levels of templates
- **HH Integration** — OAuth, auto-import, AI scoring, stop factors
- **Demo Generator** — v2 with templates and AI customization
- **Platform Admin** — multi-tenant management, settings migrations, emergency broadcast
- **Per-vacancy stop factors** — auto-reject by city/age/experience/documents

## Project Structure

```
app/
  (modules)/hr/         — HR module pages
  (admin)/admin/        — Admin pages (clients, tariffs, platform)
  (public)/             — Public pages (vacancy, demo, candidate, intake)
  api/                  — API routes
components/
  vacancies/            — Vacancy-related UI components
  dashboard/            — Dashboard, header, sidebar
  hr/                   — HR-specific components
lib/
  db/                   — Drizzle schema and connection
  ai/                   — AI processors and security filters
  hh/                   — hh.ru integration
  funnel-builder/       — Funnel configuration logic
  platform/             — Platform-level operations
drizzle/                — SQL migrations (0001-0131)
```

## Quick Start

```bash
pnpm install
cp .env.example .env.local
# Fill DATABASE_URL, ANTHROPIC_API_KEY, NEXTAUTH_SECRET
pnpm db:push     # or apply migrations from drizzle/
pnpm dev
```

See [CLAUDE.md](./CLAUDE.md) for project conventions and operational details.
See [CHANGELOG.md](./CHANGELOG.md) for release history.
