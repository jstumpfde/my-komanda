# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Команды

```bash
pnpm dev          # запуск dev-сервера (Next.js 16, порт 3000)
pnpm build        # продакшн-сборка (TypeScript-ошибки НЕ блокируют — ignoreBuildErrors: true)
pnpm lint         # ESLint
```

Тестов нет — проект без тестового фреймворка.

## Архитектура

**Frontend-only приложение** — бэкенда нет. Все данные хранятся in-memory + localStorage. Демо-данные захардкожены в компонентах (например, `initialColumns` в `app/page.tsx`).

### Стек

- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS 4 (oklch-переменные) + shadcn/ui (стиль new-york, ~50 компонентов в `components/ui/`)
- Иконки: только Lucide React. Графики: Recharts
- Формы: React Hook Form + Zod
- Пакетный менеджер: pnpm

### Состояние и данные

- Кастомный хук `useLocalStorage<T>` (`hooks/use-local-storage.ts`) — основной паттерн хранения. Автоматически десериализует Date-строки.
- Нет Redux/Zustand/других стейт-менеджеров — только React Context + useState + useLocalStorage.
- Контексты оборачиваются в `components/providers.tsx`: ThemeProvider (light/dark/warm) + AuthProvider.

### Аутентификация (демо)

`lib/auth.tsx` — AuthContext с 5 ролями: admin, manager, client, client_hr, candidate. Захардкоженные демо-пользователи, переключение ролей через localStorage (`hireflow-view-role`). `realRole` всегда "admin" в демо-режиме.

### Воронка кандидатов

Канбан-доска с 5 колонками в коде (`lib/column-config.ts`): `new` → `demo` → `scheduled` → `interviewed` → `hired`. Каждая колонка имеет цветовой градиент, процент прогресса и набор доступных действий. Авто-продвижение для колонок: new, demo, scheduled. HR-решение — в колонке `interviewed`.

4 режима отображения: канбан, список, воронка, плитки — без drag-and-drop.

### Темы и брендинг

- 3 темы (light/dark/warm) через next-themes, CSS-переменные в `app/globals.css` с `@custom-variant`
- Брендинг клиента (`lib/branding.ts`): CSS-переменные `--brand-primary`, `--brand-bg`, `--brand-text`. Хранится в localStorage (`hireflow-brand`). Доступен на тарифах business/pro. Применяется к публичным страницам.

### Маршруты (25 страниц)

Все страницы — `"use client"` (нет серверных компонентов кроме layout).

- **Дашборд**: `/` (канбан), `/overview` (KPI), `/candidates`, `/interviews`, `/analytics`, `/sources`, `/referrals`
- **Вакансии**: `/vacancies/new` (wizard 5 шагов), `/vacancies/[id]` (канбан/курс/аналитика/автоматизация/публикация/настройки)
- **Настройки**: `/settings/company`, `/settings/team`, `/settings/integrations`, `/settings/schedule`, `/settings/notifications`, `/settings/billing`
- **Админ**: `/admin/tariffs`, `/admin/clients`
- **Публичные** (без авторизации): `/vacancy/[slug]`, `/candidate/[token]`, `/schedule/[token]`, `/ref/[id]`, `/register`, `/login`, `/onboarding`

## Соглашения

- Весь UI на русском (захардкожен, без i18n)
- Файлы: kebab-case, экспорт: named exports
- Стилизация: Tailwind + `cn()` из `lib/utils.ts` для условных классов
- Импорты: `@/components`, `@/lib`, `@/hooks`
- next.config.mjs: `ignoreBuildErrors: true`, `images.unoptimized: true`
