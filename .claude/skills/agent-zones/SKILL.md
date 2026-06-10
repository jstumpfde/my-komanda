---
name: agent-zones
description: Запуск фоновых агентов в my-komanda по непересекающимся зонам файлов с worktree-изоляцией — как координатору распределять работу, чтобы агенты не конфликтовали и не ломали основной репо. Использовать при делегировании реализации нескольким агентам параллельно.
---

# Зоны для фоновых агентов (Company24)

Координатор (главный чат, Opus) распределяет реализацию Sonnet-агентам параллельно.
Правило: параллелить можно ТОЛЬКО непересекающиеся зоны; деплой/мердж — централизованно.

## Жёсткие правила в КАЖДЫЙ бриф агента
1. «Работай ТОЛЬКО в текущем каталоге (твой git worktree). ЗАПРЕЩЕНЫ git-команды/сборки/изменения в /Users/juri/Projects/my-komanda (основной репо) и на серверах.»
2. Синк develop: `git merge origin/develop` в СВОЁМ каталоге (НЕ `git reset --hard` — инцидент 10.06: агент сбросил основной репо на ветке main, затёр незакоммиченное).
3. `pnpm build` запускать В СВОЁМ worktree; нет node_modules → `pnpm install --prefer-offline`. НЕ собирать основной репо (агент «проверил сборку» не на своём коде — инцидент 10.06).
4. Перед новым кодом — grep на существующую реализацию (дубли запрещены; карьерная страница уже была — агент чуть не сделал дубль).
5. НЕ коммитить/пушить/деплоить — это делает координатор.

## Запуск (Agent tool)
- `isolation: "worktree"` + `run_in_background: true` + `model: sonnet`.
- Зоны разводить ПО ФАЙЛАМ, не по темам. Пример развода (security-патч 10.06):
  - Агент A: app/api/modules/hr/**, integrations/hh, tts, telegram webhooks, company/*
  - Агент B: lib/**, next.config.mjs, app/(public)/**, auth.ts, scripts/
  - Агент C: package.json + pnpm-lock.yaml (бамп зависимостей)
  → смерджились без конфликтов.

## После волны агентов — координатор
1. Проверить основной репо: `git -C /Users/juri/Projects/my-komanda status && git log --oneline -1` (не сдвинут ли main, целы ли untracked).
2. Ревью диффа КАЖДОГО агента (особенно: смена контрактов API, инверсия логики, точечность правок в гигантах demo-client/page.tsx/schema).
3. Коммит каждой ветки (исключая .claude/settings.local.json), мердж в integration-worktree (ветка develop), `pnpm install` если менялись deps, `pnpm build`, push origin develop.
4. Стейджинг → проверка → прод по скиллу company24-deploy.

## Число агентов
= числу независимых зон. Лимиты API: если упёрлись — агенты ждут, переподнять, ничего не теряется. См. memory parallel-work-coordinator-decides, single-deploy-chat-and-agent-model, agent-worktree-discipline, delegate-to-sonnet-coordinate-on-opus.
