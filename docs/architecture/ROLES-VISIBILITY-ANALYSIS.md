# Анализ ролевой видимости — my-komanda / Company24.pro

> Дата: 2026-06-05. Read-only анализ — код не изменён.  
> Версия: Next.js App Router, роли из `lib/auth.tsx`, матрица из `/settings/roles`.

---

## Роли в системе

| Роль | Метка | Описание |
|---|---|---|
| `platform_admin` | Администратор платформы | Юрий — полный доступ ко всему |
| `platform_manager` | Менеджер платформы | Платформенный менеджер, без настроек |
| `director` | Директор | Полный доступ клиента, включая биллинг и настройки компании |
| `hr_lead` | Главный HR | Найм + адаптация + настройки найма; **без** настроек компании |
| `hr_manager` | HR-менеджер | Только вакансии/кандидаты/интервью; без настроек вообще |
| `department_head` | Руководитель отдела | Только обзор; нет доступа к найму |
| `observer` | Наблюдатель | Только чтение обзора |
| `tester_hr` | Тестировщик HR | Найм без настроек (тестовая роль) |
| `employee` | Сотрудник | Нет доступа к платформе |

---

## A. Полный каталог разделов и страниц платформы

### A.1 HR-модуль (`/hr/`)

#### Найм (sidebar-группа «Найм»)

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/dashboard` | Дашборд HR | Sidebar: platform-роли. Клиенты — только через прямой URL |
| `/hr/vacancies` | Вакансии | Sidebar: все authenticated роли (hrLite → только этот пункт) |
| `/hr/library` | Библиотека шаблонов | Sidebar: platform-роли. Клиенты — прямой URL, роль не проверяется |
| `/hr/candidates` | Кандидаты | Sidebar: platform-роли. Клиенты — прямой URL |
| `/hr/talent-pool` | Talent Pool | Sidebar: platform-роли. Клиенты — прямой URL, нет page guard |
| `/hr/analytics` | Аналитика найма | Sidebar: platform-роли. Клиенты — прямой URL, нет page guard |
| `/hr/calendar` | Календарь | Sidebar: platform-роли. Клиенты — прямой URL |
| `/hr/interviews` | Интервью | Sidebar: platform-роли. Клиенты — прямой URL |
| `/hr/hiring-settings` | Настройки найма | Sidebar: platform-роли. Клиенты — прямой URL. API: `requireCompany` (нет director guard на GET/PATCH кроме rolePermissions) |

#### Адаптация

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/adaptation/plans` | Планы адаптации | Sidebar: platform-роли. Клиенты — прямой URL |
| `/hr/adaptation/assignments` | Назначения | Sidebar: platform-роли |
| `/hr/adaptation/analytics` | Аналитика адаптации | Sidebar: platform-роли |
| `/hr/adaptation/gamification` | Геймификация | Sidebar: platform-роли |
| `/hr/buddy/[id]` | Наставничество | Sidebar: platform-роли |
| `/hr/preboarding` | Пребординг | Sidebar: platform-роли |
| `/hr/offboarding` | Оффбординг | Sidebar: platform-роли |

#### Персонал / Оргструктура

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/org-structure` | Орг-структура | Sidebar: platform-роли. Клиенты — прямой URL, нет page guard |
| `/hr/departments` | Отделы | Sidebar: platform-роли |
| `/hr/positions` | Должности | Sidebar: platform-роли |
| `/hr/employees` | Сотрудники | Sidebar: platform-роли («В разработке») |
| `/hr/courses` | Обучение (LMS) | Sidebar: platform-роли («В разработке») |
| `/hr/skills` | Навыки | Sidebar: platform-роли |
| `/hr/assessments` | Оценки | Sidebar: platform-роли |
| `/hr/certificates` | Сертификаты | Sidebar: platform-роли |
| `/hr/flight-risk` | Flight Risk | Sidebar: platform-роли. Клиенты — прямой URL, нет page guard |
| `/hr/pulse-surveys` | Пульс-опросы | Sidebar: platform-роли |
| `/hr/reskilling` | Reskilling | Sidebar: platform-роли |
| `/hr/predictive-hiring` | Predictive Hiring | Sidebar: platform-роли |

#### AI-инструменты HR

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/ai-assistant` | AI-ассистент | Sidebar: platform-роли |
| `/hr/agents` | AI-агенты | Sidebar: platform-роли |
| `/hr/scoring-lab` | Лаборатория скоринга | Sidebar: platform-роли, нет page guard |
| `/hr/demo-editor` | Демо-редактор | Sidebar: platform-роли |
| `/hr/funnel` | Воронка | Sidebar: legacy (platform-роли) |

#### Настройки найма (подпути /hr/settings/*)

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/settings/notifications` | Уведомления найма | Нет page guard |
| `/hr/settings/schedule` | Расписание найма | Нет page guard |
| `/hr/settings/templates` | Шаблоны сообщений | Нет page guard |
| `/hr/settings/sources` | Источники | Нет page guard |

#### Интеграции HR

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/integrations` | Интеграции (hh.ru, Bitrix) | Нет page guard; любой authenticated |
| `/hr/marketplace` | Маркетплейс | Нет page guard |

#### Аудит

| Путь | Название | Гейтинг |
|---|---|---|
| `/hr/audit-log` | Журнал аудита ФЗ-152 | API: VIEW_ROLES (director/platform_admin/platform_manager). Страница — нет page guard |

### A.2 Настройки платформы (`/settings/`)

| Путь | Название | Видно в сайдбаре | Серверный guard |
|---|---|---|---|
| `/settings/company` | Компания | director + platform_admin | API: `requireDirector` (PUT/PATCH) |
| `/settings/profile` | Профиль | все роли | requireCompany |
| `/settings/team` | Команда | director + platform_admin | API: `requireDirector` (POST/PATCH/DELETE) |
| `/settings/branding` | Брендинг | director + platform_admin | API: `requireDirector` |
| `/settings/integrations` | Интеграции | director + platform_admin | **Нет директорного guard!** requireCompany |
| `/settings/schedule` | Расписание | director + platform_admin | API: `requireDirector` (work-schedule) |
| `/settings/notifications` | Уведомления | все authenticated роли | requireCompany |
| `/settings/billing` | Тариф и оплата | director + platform_admin | API: `requireDirector` |
| `/settings/legal` | Юр. документы | director + platform_admin | Page guard: director/platform_admin. API: `requireDirector` |
| `/settings/roles` | Роли и доступ | director + platform_admin | **Нет серверного guard!** Страница открыта; API hiring-defaults: PATCH rolePermissions — director-only |

### A.3 Обзорные и вспомогательные страницы

| Путь | Название | Гейтинг |
|---|---|---|
| `/overview` | Обзор | sidebar: все (main=true) |
| `/referrals` | Рефералы | sidebar: platform-роли (PLATFORM_MENU) |
| `/hr/overview` / `/hr/overview2` | HR Обзор (legacy) | Sidebar: platform-роли |
| `/analytics` | Аналитика платформы | Нет guard |
| `/onboarding` | Онбординг | Нет guard |
| `/upgrade` | Upgrade | Публичный после auth |
| `/workshop` | Воркшоп | Нет guard |

### A.4 Не-HR модули (только platform_admin / platform_manager в сайдбаре)

Все не-HR модули попадают в `ALL_MODULES_LIST` и показываются в сайдбаре **только** для ролей `platform_admin` / `platform_manager`. Клиентские роли (`director`, `hr_lead`, `hr_manager`, `department_head`, `observer`) получают `CLIENT_MODULES_LIST = ['hr']` — т.е. в сайдбаре видят только HR-модуль. **Прямой URL всё равно работает** — нет middleware-блокировки для не-HR модулей.

| Модуль | Путь | Гейтинг сайдбара | Серверный guard |
|---|---|---|---|
| База знаний | `/knowledge-v2/` | platform-роли | requireCompany |
| Обучение (LMS отдельный) | `/learning/` | platform-роли | requireCompany |
| Задачи | `/tasks/` | platform-роли | requireCompany |
| CRM | `/sales/` | platform-роли | requireCompany |
| Маркетинг | `/marketing/` | platform-роли | requireCompany |
| B2B | `/b2b/` | platform-роли | requireCompany |
| Склад | `/warehouse/` | platform-роли | requireCompany |
| Логистика | `/logistics/` | platform-роли | requireCompany |
| Бронирование | `/booking/` | platform-роли | requireCompany |
| AI-диалер | `/dialer/` | platform-роли | requireCompany |
| ОКК | `/qc/` | platform-роли | requireCompany |

### A.5 Платформенная админка (`/admin/`)

| Путь | Гейтинг |
|---|---|
| `/admin/platform` | Server-side layout: isPlatformAdminEmail (PLATFORM_ADMIN_EMAILS) → 404 |
| `/admin/clients` | Sidebar: vis.admin (platform_admin). Нет серверного page guard! API: requirePlatformAdmin |
| `/admin/dashboard` | Sidebar: vis.admin. Нет page guard |
| `/admin/tariffs` | Sidebar: vis.admin. Нет page guard |
| `/admin/roles` | Sidebar: vis.admin. Нет page guard |
| `/admin/integrators` | Sidebar: vis.admin. Нет page guard |
| `/admin/requests` | Sidebar: vis.admin. Нет page guard |

---

## B. Рекомендуемая расширенная матрица прав

Текущих разделов в матрице: 12 (Вакансии, Кандидаты, Интервью, Адаптация, LMS, Оценка навыков, Аналитика, Настройки компании, Команда, Биллинг, Обзор, Корзина).

**Рекомендуемые дополнительные разделы** (ниже — группы):

### Группа: HR — Найм

| Раздел | director | hr_lead | hr_manager | department_head | observer |
|---|---|---|---|---|---|
| Вакансии ✓ (уже есть) | ✓ | ✓ | ✓ | — | — |
| Кандидаты ✓ (уже есть) | ✓ | ✓ | ✓ | — | — |
| Интервью ✓ (уже есть) | ✓ | ✓ | ✓ | — | — |
| Talent Pool (**добавить**) | ✓ | ✓ | ✓ | — | — |
| Аналитика найма (**добавить**) | ✓ | ✓ | — | — | — |
| Шаблоны / Библиотека (**добавить**) | ✓ | ✓ | ✓ | — | — |
| Настройки найма (**добавить**) | ✓ | ✓ | — | — | — |
| Интеграции (hh.ru) (**добавить**) | ✓ | ✓ | — | — | — |
| Корзина вакансий ✓ (уже есть) | ✓ | ✓ | toggle | — | — |
| Журнал аудита (**добавить**) | ✓ | — | — | — | — |

### Группа: HR — Персонал и развитие

| Раздел | director | hr_lead | hr_manager | department_head | observer |
|---|---|---|---|---|---|
| Адаптация ✓ (уже есть) | ✓ | ✓ | — | — | — |
| Пребординг/Оффбординг (**добавить**) | ✓ | ✓ | — | — | — |
| LMS/Обучение ✓ (уже есть) | ✓ | ✓ | — | ✓ (свой отдел) | — |
| Оценка навыков ✓ (уже есть) | ✓ | ✓ | — | ✓ (свой отдел) | — |
| Flight Risk (**добавить**) | ✓ | ✓ | — | — | — |
| Пульс-опросы (**добавить**) | ✓ | ✓ | — | — | — |
| Сертификаты (**добавить**) | ✓ | ✓ | — | ✓ | — |

### Группа: Оргструктура

| Раздел | director | hr_lead | hr_manager | department_head | observer |
|---|---|---|---|---|---|
| Орг-структура (**добавить**) | ✓ | ✓ | — | ✓ (свой отдел, read-only) | — |
| Отделы / Должности (**добавить**) | ✓ | ✓ | — | — | — |
| Сотрудники (справочник) (**добавить**) | ✓ | ✓ | — | ✓ (свой отдел) | — |

### Группа: Настройки компании

| Раздел | director | hr_lead | hr_manager | department_head | observer |
|---|---|---|---|---|---|
| Настройки компании ✓ (уже есть) | ✓ | — | — | — | — |
| Команда ✓ (уже есть) | ✓ | — | — | — | — |
| Брендинг (**добавить**) | ✓ | — | — | — | — |
| Интеграции (платформ) (**добавить**) | ✓ | — | — | — | — |
| Юр. документы (**добавить**) | ✓ | — | — | — | — |
| Биллинг ✓ (уже есть) | ✓ | — | — | — | — |
| Роли и доступ (**добавить**) | ✓ | — | — | — | — |
| Обзор ✓ (уже есть) | ✓ | ✓ | ✓ | ✓ | ✓ |

### Группа: Не-HR модули (рекомендация — скрыть от клиентов, оставить только platform-ролям)

Эти модули сейчас фактически не показываются в сайдбаре клиентов (`CLIENT_MODULES_LIST = ['hr']`), но при желании можно предоставить директору/hr_lead через настройку активных модулей.

| Модуль | director | hr_lead | hr_manager | department_head | observer |
|---|---|---|---|---|---|
| База знаний (**добавить как опция**) | ✓ (если включён) | ✓ (если включён) | — | — | — |
| Задачи (**добавить как опция**) | ✓ | — | — | ✓ (только свои) | — |
| CRM/Продажи | platform only | platform only | — | — | — |
| Маркетинг | platform only | platform only | — | — | — |
| Склад/Логистика | platform only | platform only | — | — | — |
| Бронирование | platform only | platform only | — | — | — |
| AI-диалер | platform only | platform only | — | — | — |
| ОКК | platform only | platform only | — | — | — |
| B2B | platform only | platform only | — | — | — |

---

## C. «Что скрыть от кого» — конкретный список

### C.1 Критичные проблемы (риск: данные/безопасность)

1. **`/settings/integrations` — нет page guard**  
   Страница содержит hh.ru токен, Bitrix24-подключение, AMO-подключение. Видна по прямому URL **всем authenticated** пользователям, включая `hr_manager`, `department_head`, `observer`. API не защищён `requireDirector`. **Рекомендация**: добавить page guard `hasAccess(["director", "platform_admin"])` + `requireDirector` на PATCH-эндпоинты интеграций.

2. **`/settings/roles` — нет серверного page guard**  
   Страница настройки матрицы прав доступна по прямому URL **всем authenticated**. API `hiring-defaults PATCH` для `rolePermissions` проверяет director-only, но GET открыт. **Рекомендация**: добавить page guard `hasAccess(["director", "platform_admin"])`. Сама /settings/roles должна быть **director-only** (не hr_lead).

3. **`/settings/billing` — нет page guard**  
   Содержит тарифный план, счета, оплату. Должна быть видна только директору. API защищён `requireDirector`, но страница открыта всем. **Рекомендация**: page guard `hasAccess(["director", "platform_admin"])`.

4. **`/settings/team` — нет page guard**  
   Управление членами команды (добавить/уволить/сменить роль). API защищён `requireDirector` на POST/PATCH/DELETE, но страница открыта всем. **Рекомендация**: page guard `hasAccess(["director", "platform_admin"])`.

5. **`/hr/integrations` — нет page guard**  
   Дублирует часть `/settings/integrations`, доступна без проверки роли. **Рекомендация**: ограничить director + hr_lead.

### C.2 Средние проблемы (риск: путаница, нежелательный доступ к данным)

6. **`/hr/hiring-settings` — нет page guard**  
   Настройки найма (воронка, автоматизация, расписание, стоп-факторы, Telegram). Доступна по прямому URL `department_head` / `observer`. API: `requireCompany` — читать может любой authenticated. **Рекомендация**: ограничить director + hr_lead + hr_manager (только чтение для hr_manager).

7. **`/hr/analytics` — нет page guard**  
   Аналитика найма (конверсии, источники, сроки). Чувствительные метрики. **Рекомендация**: director + hr_lead.

8. **`/hr/talent-pool` — нет page guard**  
   База кандидатов «про запас». Персональные данные. **Рекомендация**: director + hr_lead + hr_manager.

9. **`/hr/flight-risk` — нет page guard**  
   Риски увольнения сотрудников — чувствительные HR-аналитические данные. **Рекомендация**: director + hr_lead.

10. **`/hr/audit-log` — нет page guard (только API-guard)**  
    Журнал операций с ПДн. API защищён VIEW_ROLES, но страница не имеет page guard (дошедший до неё увидит пустой список от API, но знает что раздел существует). **Рекомендация**: page guard `hasAccess(["director", "platform_admin"])`.

11. **`/hr/scoring-lab` — нет page guard**  
    AI-лаборатория. Показывает внутренние настройки AI. **Рекомендация**: director + hr_lead + platform-роли.

12. **Не-HR модули по прямому URL (marketing, sales, warehouse, logistics, booking, dialer, qc, b2b, knowledge-v2, learning, tasks)**  
    Middleware не блокирует — закомментированная проверка модулей. Любой authenticated может перейти на `/marketing/dashboard` и увидеть UI. **Рекомендация**: включить middleware-проверку модулей (`DEV_SKIP_MODULE_CHECK`) когда будет готов биллинг.

13. **`/admin/clients`, `/admin/dashboard`, `/admin/tariffs`, `/admin/roles`, `/admin/integrators`, `/admin/requests` — нет page guard**  
    Sidebar показывает только platform_admin (vis.admin), но прямой URL откроет любому authenticated. API роутов защищены `requirePlatformAdmin`, но страницы нет. **Рекомендация**: добавить server-side layout guard для `(admin)/` группы.

### C.3 Низкий риск (косметика/порядок)

14. **`/hr/library`, `/hr/candidates`, `/hr/calendar`, `/hr/interviews`** — доступны по прямому URL hr_manager и выше, что соответствует бизнес-логике. Можно оставить.

15. **`/hr/org-structure`, `/hr/departments`, `/hr/positions`** — доступны по прямому URL. department_head логично читать свой отдел, но сейчас видит все. Нужна фильтрация по отделу, но это отдельная задача.

---

## D. План внедрения

### D.1 Быстро (frontend page guard, ~2-4 часа)

Добавить `useAuth` + редирект/блок доступа в page component. Не требует серверных изменений:

1. `/settings/billing` → guard `hasAccess(["director", "platform_admin"])`
2. `/settings/team` → guard `hasAccess(["director", "platform_admin"])`
3. `/settings/integrations` → guard `hasAccess(["director", "platform_admin"])`
4. `/settings/roles` → guard `hasAccess(["director", "platform_admin"])`
5. `/hr/analytics` → guard `hasAccess(["director", "hr_lead", "platform_admin", "platform_manager"])`
6. `/hr/flight-risk` → guard `hasAccess(["director", "hr_lead", "platform_admin", "platform_manager"])`
7. `/hr/audit-log` → guard `hasAccess(["director", "platform_admin"])`

> Паттерн: такой же как в `legal/page.tsx` — `if (!hasAccess([...])) return <AccessDenied />`

### D.2 Средне (серверный энфорсмент, ~4-8 часов)

Добавить `requireDirector()` или `requireHrLead()` на мутационные API:

1. `/api/integrations/hh/*` (auth, callback, revoke) → `requireDirector`
2. `/api/modules/hr/company/trash-retention` PATCH → `requireDirector`
3. `/api/modules/hr/company/send-delay` PATCH → `requireDirector`
4. `/api/modules/hr/company/telegram` POST → `requireDirector`
5. Добавить `requireHrLead()` хелпер (director + hr_lead) для настроек найма

Добавить server-side layout guard для `(admin)/` без `/admin/platform/`:

```tsx
// app/(admin)/layout.tsx
const session = await auth()
if (!["platform_admin", "admin"].includes(session?.user?.role ?? "")) {
  notFound() // 404, не 403
}
```

### D.3 Отложить / требует осторожности

- **Middleware module-check**: закомментированный блок уже есть. Включить после настройки биллинга. Риск: сломать доступ к существующим модулям у клиентов если billing_data не настроен.
- **Фильтрация org-structure по отделу для department_head**: требует рефакторинга запросов.
- **Матрица как реальный enforcement**: сейчас матрица на `/settings/roles` сохраняется в `hiringDefaultsJson.rolePermissions`, но большинство страниц её не читают. Планировать как отдельную задачу — подключить `rolePermissions.matrix` к реальным sidebar/page guards.
- **`/settings/notifications` для hr_manager**: сейчас полностью открыта, что разумно (личные уведомления). Оставить.

### D.4 Расширение матрицы (UI на `/settings/roles`)

Добавить новые строки в `SECTIONS[]` в `app/(platform)/settings/roles/page.tsx`:

```
talent_pool     — Talent Pool          director/hr_lead/hr_manager
hr_analytics    — Аналитика найма      director/hr_lead
integrations    — Интеграции           director
branding        — Брендинг             director
legal           — Юр. документы        director
roles           — Роли и доступ        director
audit_log       — Журнал аудита        director
hiring_settings — Настройки найма      director/hr_lead
org_structure   — Орг-структура        director/hr_lead/department_head(read)
flight_risk     — Flight Risk          director/hr_lead
```

**Риски при внедрении матрицы:**
- Текущий код матрицы на `/settings/roles` сохраняет overrides, но страницы их не читают. Если добавить новые строки без подключения enforcement — матрица будет выглядеть полнее, но не работать. Рекомендуется сначала подключить enforcement для 2-3 ключевых разделов (billing, integrations, roles) и протестировать на стейджинге.

---

## Итоговая сводка

**Текущее состояние:**
- Sidebar правильно скрывает большинство разделов от клиентских ролей (`CLIENT_MODULES_LIST = ['hr']` для не-HR; `hrLite` — только «Вакансии» в HR-блоке).
- Настройки (`getVisibleSettings`) правильно скрывают company/team/branding/billing/legal/roles от hr_lead и ниже в flyout-меню.
- API мутации (`requireDirector`) корректно защищены для компанийских настроек.

**Главные уязвимости:**
- **Отсутствие page guard** на `/settings/billing`, `/settings/team`, `/settings/integrations`, `/settings/roles` — доступны по прямому URL любым authenticated.
- **Отсутствие page guard** на `/admin/clients` и других `/admin/*` (кроме `/admin/platform`) — sidebar скрывает, но URL открыт.
- **`/hr/integrations`** — полностью открыта, содержит чувствительные данные подключений.
- **`/hr/analytics`**, **`/hr/flight-risk`**, **`/hr/audit-log`**, **`/hr/scoring-lab`** — нет page guard, но критичность умеренная.
- **Матрица прав** (`/settings/roles`) содержит 12 разделов, не хватает 10+ важных: интеграции, брендинг, юр. документы, роли и доступ, аналитика найма, настройки найма, talent pool, орг-структура, flight risk, журнал аудита.
