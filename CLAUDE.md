# CLAUDE.md — контекст проекта my-komanda

## Что это
my-komanda — модульная бизнес-платформа для российских компаний (МСБ, 10-500 сотрудников).

## Стек
Next.js (App Router), TypeScript, Tailwind, shadcn/ui, pnpm, PostgreSQL 16, Drizzle ORM

## Команды
pnpm dev — запуск (порт 3000)
Если порт занят: kill $(lsof -t -i:3000) 2>/dev/null; pnpm dev

## Правила
- Все тексты на русском
- shadcn/ui + Tailwind, без отдельных CSS
- Цветовая палитра: темно-фиолетовый sidebar
- Перед коммитом: проверить pnpm dev

## Git-правила
- Коммить и пушь напрямую в main
- Никогда не создавай PR
- Не спрашивай подтверждения

---

## Архитектура — 3 слоя

```
app/                  — Next.js маршруты (App Router)
├── (auth)/           — публичные страницы входа/регистрации
├── (public)/         — страницы без авторизации (вакансия, кандидат, расписание)
├── (platform)/       — основные страницы платформы (overview, settings, analytics)
├── (modules)/        — модульные страницы (hr/*, marketing/*, ...)
├── (admin)/          — панель администратора платформы
└── api/              — API-маршруты (auth, companies, modules/hr)

lib/                  — бизнес-логика и типы
├── modules/          — реестр модулей, типы, guard
├── sidebar/          — построитель меню сайдбара
├── db/               — Drizzle schema, migrate, клиент
└── *.ts              — типы домена (vacancy, company, tariff, auth...)

components/           — UI-компоненты
├── ui/               — shadcn/ui базовые компоненты
├── dashboard/        — sidebar, header, kanban, карточки кандидатов
├── settings/         — навигация и заголовки настроек
└── vacancies/        — конструктор вакансий (шаги, редактор, публикация)
```

---

## Роли пользователей

Определены в `lib/auth.tsx`. Две группы:

**Платформа** (скрыты от клиента):
| Роль | Метка | Доступ |
|------|-------|--------|
| `platform_admin` | Администратор платформы | Всё включая admin-панель |
| `platform_manager` | Менеджер платформы | Без настроек и admin |

**Клиент** (уровень компании):
| Роль | Метка | Доступ |
|------|-------|--------|
| `director` | Директор | Всё включая billing, без admin |
| `hr_lead` | Главный HR | Найм + инструменты + настройки (без billing) |
| `hr_manager` | HR-менеджер | Только найм (главная + найм) |
| `department_head` | Руководитель отдела | Только главная |
| `observer` | Наблюдатель | Только главная, read-only |

Проверка доступа: `hasAccess(allowed: UserRole[])` из `useAuth()`.
Видимость сайдбара: `getVisibleSections(role)` → `{ main, hiring, tools, settings, admin }`.
Импersonation (view-as): `setRole(role)` / `returnToAdmin()` с хранением в localStorage.

---

## Сайдбар — Вариант A

**Свёрнутый (56px):** иконки модулей вертикально — HR · МКТ · ПРД (+ будущие).
**Развёрнутый:** список пунктов меню активного модуля, сгруппированных по разделам.

Группы модуля HR:
- **Найм** — Вакансии, Кандидаты, Интервью, Источники
- **Адаптация** — Онбординг
- **Обучение** — (будущее)
- **Развитие** — Talent Pool
- **Аналитика HR** — Аналитика

Построение меню: `lib/sidebar/module-menus.ts` → `getModuleMenuItems(activeModules)`.
Конфиг иконок и путей: `lib/modules/registry.ts` → `MODULE_REGISTRY`.

---

## Бизнес-модель — Тарифы

Определены в `lib/tariff-types.ts`:

| Тариф | Цена | Вакансии | Кандидаты | Особенности |
|-------|------|----------|-----------|-------------|
| Solo | 14 900 ₽/мес | 1 | 400 | — |
| Starter | 24 900 ₽/мес | 3 | 1 200 | — |
| Business ⭐ | 49 900 ₽/мес | 10 | 4 000 | Branding, AI-видеоинтервью, приоритетная поддержка |
| Pro | 99 900 ₽/мес | 22 | 10 000 | Всё + custom domain, API, персональный менеджер |

Статусы компании: `active` / `trial` / `overdue` / `churned`.

---

## Файловая структура

```
app/
├── (auth)/login, register, forgot-password
├── (public)/vacancy/[slug], candidate/[token], schedule/[token], ref/[id]
├── (platform)/overview, analytics, referrals
│   └── settings/ profile, company, team, billing, integrations,
│                 schedule, notifications, branding
├── (modules)/hr/
│   ├── vacancies/ (list, [id], create, new)
│   ├── candidates, demo-editor, interviews, sources, talent-pool
│   └── onboarding/ (page, channel, voice, smart-input, enrichment-preview)
├── (admin)/admin/ clients, tariffs
└── api/
    ├── auth/ [...nextauth], register, me
    ├── companies/ (root, by-inn, by-bik, by-bank-name)
    └── modules/hr/ vacancies/[id], candidates/[id]/{stage,notes}, demos/[id]

lib/
├── modules/    types.ts, registry.ts, guard.tsx
├── sidebar/    module-menus.ts
├── db/         index.ts, schema.ts, migrate.ts
├── auth.tsx, auth-client.ts
├── tariff-types.ts, company-types.ts, vacancy-types.ts
├── company-storage.ts, vacancy-storage.ts
├── candidate-tokens.ts, column-config.ts, onboarding.ts
├── position-classifier.ts, branding.ts, clean-html.ts
├── course-types.ts, referral-types.ts, utm-types.ts
└── api-helpers.ts, utils.ts

components/
├── ui/           (55+ shadcn-компонентов)
├── dashboard/    sidebar, header, mobile-nav, kanban-board,
│                 candidate-card/profile/filters/drawer,
│                 list/tiles/funnel-view, dialogs, command-palette
├── settings/     settings-header, settings-navigation, settings-sub-nav
├── vacancies/    step-basic/editor/market/publish/questionnaire,
│                 demo-card, hh-integration, automation-settings,
│                 course-tab, notion-editor, ai-generate-dialog,
│                 create/ (step-company/product/funnel/vacancy/candidate)
└── providers.tsx, theme-provider.tsx
```
