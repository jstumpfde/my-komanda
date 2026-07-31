# AI-РОП: перенос call-agent (Call-Pilot) внутрь Company24 — план адаптации

Дата: 11.07.2026. Заказ Юрия: лендинг /products/ai-rop НЕ трогать — переносим САМ
ПРОДУКТ. Всё, что сделано в call-agent на Маркет Радаре, внести в модуль AI-РОП
на Company24; различия учитывать: платформенное переиспользовать, не дублировать.
Оригинал на радаре продолжает работать (Орлинк) — его не трогаем.

Источники: копия исходников call-agent (scratchpad сессии 1bb2afa2 → `ca-src/`),
дамп схемы `callagent-schema.sql`, две инвентаризации (call-agent + платформа).

## Ключевые решения

1. **Модульный монолит, НЕ форк.** AI-РОП = модуль внутри my-komanda:
   `app/(modules)/ai-rop/*`, `app/api/modules/ai-rop/*`, `lib/ai-rop/*`.
   Никакого basePath/отдельного порта/отдельной БД.
2. **ModuleId `ai_rop`** добавляем в `lib/modules/types.ts` + `MODULE_REGISTRY`
   (иконка Phone). Модуль-пустышку `qc` НЕ трогаем (бэклог: вывести после боевого
   AI-РОП). Видимость — default-OFF: `ai_rop` НЕ добавлять в ALL_MODULES_FOR_ROLE;
   включение per-company через `companies.enabledModules` (политика «флаги
   default-OFF при посетителях»).
3. **Auth/роли — платформенные.** Никаких ca_session/sessions/login. Маппинг:
   - canManage (owner/admin) → `requireDirector()`;
   - canViewTeam (owner/admin/head) → директор ИЛИ `role === "department_head"`
     ИЛИ permissions-флаг `rop_view_team` (хелпер `lib/ai-rop/access.ts`);
   - manager → пользователь платформы, привязанный к `rop_managers.userId`
     (или по bitrixManagerId); видит только свои звонки (RLS-хелпер как rls.ts).
   - demo-роль call-agent НЕ переносим (на платформе есть демо-тенант).
4. **Таблицы**: префикс `rop_`, скоуп `tenantId → companies.id` (uuid), как sales_*.
   Маппинг (28 таблиц call-agent → my-komanda):
   | call-agent | my-komanda | примечание |
   |---|---|---|
   | tenants | — | = companies; продуктовые настройки → rop_settings |
   | users, sessions, ca_login_attempts | — | платформенный auth |
   | managers | rop_managers | + userId (nullable FK на users) |
   | calls | rop_calls | центральная; те же статусы/поля |
   | transcripts | rop_transcripts | PK = callId |
   | analyses | rop_analyses | PK = callId, все *_json |
   | sales_scripts | rop_sales_scripts | скрипты + чек-листы |
   | card_discrepancies | rop_discrepancies | |
   | crm_write_log | rop_crm_write_log | идемпотентность как была |
   | reminders_auto | rop_reminders | reminders (drizzle-задел) НЕ переносим |
   | report_schedules | rop_report_schedules | |
   | usage_events | rop_usage_events | бюджет-гард (STT-секунды и т.п.) |
   | ca_token_ledger | rop_token_ledger | биллинг-токены |
   | ca_plans / ca_promos / ca_referrals / ca_partners / ca_payments | rop_plans / rop_promos / rop_referrals / rop_partners / rop_payments | платформенный уровень (без tenantId у plans/promos) |
   | ca_billing_reminders | rop_billing_reminders | дедуп уведомлений |
   | ca_objection_clusters | rop_objection_clusters | PK tenantId |
   | ca_report_views | rop_report_views | |
   | settings (глобальный PK=key!) | rop_settings | PK companyId, jsonb + явные колонки; известный баг per-tenant чинится переносом |
   | events (outbox) | — | не используется, не переносим |
   | onboarding_requests, contact_requests | — | лендинговое, не переносим (лендинг — отдельная тема) |
   Миграция: `drizzle/0284_ai_rop.sql` (0275 занят веткой согласий).
5. **Per-company Bitrix.** В call-agent BITRIX_WEBHOOK_URL — глобальный env (один
   клиент). На Company24 — колонки rop_settings: `bitrixWebhookUrl`,
   `bitrixInboundToken`, dryRun-флаги (crm/messages, ДЕФОЛТ dry=true!), glossary,
   analysisModel, discrepancy-настройки, budget, tokenBilling. Все lib/ai-rop/*
   принимают конфиг параметром, НЕ читают env напрямую.
6. **AI — через платформу.** Анализ: обёртка callWithTool по образцу ca
   ai-provider, но baseURL = getClaudeApiUrl() (lib/claude-proxy), модели из
   lib/ai/models.ts (+ константа для анализа звонков), thinking:disabled, retry.
   OpenAI-fallback сохраняем (env OPENAI_*, опционален). КАЖДЫЙ AI-вызов →
   logAiCall (ai_usage_log, action `rop_*`) — плюс rop_usage_events для
   бюджет-гарда как в оригинале. STT: Yandex SpeechKit основной (152-ФЗ),
   Whisper fallback только по флагу per-company (default OFF). pii-mask (regex)
   переносим; ner-mask — NER_SERVICE_URL env, на проде company24 сервиса НЕТ
   (fail-open) — пометить Юрию.
7. **Воркер → кроны платформы.** PM2-воркер не заводим. 5 циклов → cron-роуты
   (checkCronAuth + startCronRun/finishCronRun):
   - `/api/cron/ai-rop-process` — каждую минуту, батч с тайм-бюджетом ~50с
     (очередь pending/failed/no_recording/зависшие; busy-guard);
   - `/api/cron/ai-rop-import` — */5 (авто-импорт звонков) + внутри забор
     activities (email/чаты) раз в 10 мин по метке;
   - `/api/cron/ai-rop-retry` — */30 (реанимация failed по ретраебл-паттернам);
   - `/api/cron/ai-rop-reports` — каждую минуту (расписания отчётов);
   - `/api/cron/ai-rop-billing` — раз в сутки (напоминания + автопродление);
   - `/api/cron/ai-rop-crm-outcomes` — раз в 6 ч.
   Crontab на сервере добавляет координатор при деплое (не агенты).
8. **Аудио — НЕ в public/uploads** (там раздача без авторизации — утечка записей).
   Хранение: `storage/rop-recordings/<companyId>/` (env ROP_RECORDINGS_DIR),
   вне public. Раздача только через `/api/modules/ai-rop/recordings/[id]`
   (requireCompany + RLS), стрим как в оригинале. TTL-очистку старых записей
   делаем cron-частью ai-rop-process (не внешний find).
9. **Email — платформенный smtp.ts** (lib/email/smtp.ts), MR_NOTIFY_URL/
   CA_NOTIFY_SECRET исчезают. TG-алерты (здоровье провайдера, плохие звонки) —
   через lib/notifications/telegram + platformSettings-паттерн guard-alert,
   НЕ ALERT_TG_* env. In-app — таблица notifications.
10. **Публичный отчёт**: rop_report_shares (свой, по паттерну reportShares,
    НЕ трогаем HR-таблицу) + страница `/rop-report/[token]` (+ PUBLIC_PREFIXES),
    tv-режим, журнал просмотров rop_report_views.
11. **Админка биллинга** (токены/тарифы/промо/платежи — сейчас в market-radar
    через CA_ADMIN_TOKEN): переносим в /admin/platform (таб «AI-РОП»),
    гейт isPlatformAdmin. Bearer-контракт НЕ переносим.
12. **PDF-отчёт и .docx-загрузка** требуют новых npm-пакетов (puppeteer-core +
    @sparticuz/chromium; mammoth). Правило «не добавлять пакеты без разрешения» →
    вынесено в вопросы Юрию; фичи в последней под-фазе, всё остальное их не ждёт.
13. **Лендинг и юрдоки call-agent** не переносим. Центр знаний call-agent
    (статьи «как пользоваться») — переносим контент в раздел модуля (стр.
    «Обучение» внутри ai-rop), позже можно в платформенную БЗ.
14. **Брендинг в UI**: «AI-РОП» (внутри платформы), не Call-Pilot/Колл Агент.
    Тексты русские, shadcn+DESIGN-REFERENCE.md, таблицы через data-table,
    мобильная адаптация карточками (как сделано в ca 04.07).

## Дифф «было на Company24, нет на радаре» (не затирать, переиспользовать)
- auth/роли/пользователи, мультитенантность, enabledModules;
- ai_usage_log + computeCostUsd (учёт стоимости) — на радаре только units;
- cron_runs-журнал и health-check кронов;
- notifications (in-app), TG-бот per-company, smtp;
- salesDeals/salesContacts (модуль Продажи) — связка звонок↔сделка Company24
  (сверх того, что было на радаре: там только Bitrix клиента) — фаза «после
  паритета», отдельным пунктом бэклога;
- демо-тенант платформы (вместо ca demo-роли).

## Дифф «было на радаре, нет на Company24» (переносим — суть заказа)
Весь продукт: пайплайн разбора, STT, анализатор (оценка/чек-лист/тональность/
возражения/coaching/rop_notes/callback), дашборд+KPI, карточка звонка с плеером,
клиенты-360, динамика менеджеров, библиотека возражений с AI-кластеризацией,
кабинет РОПа, лидерборд/геймификация, очередь-диагностика, отчёты в Bitrix IM +
расписания, расхождения с CRM, CRM-журнал, напоминания (parseDueDate ru),
токен-биллинг с enforcement, публичный дашборд+просмотры, budget-гард,
глоссарий, выбор модели per-company, импорт исторический+авто, вебхук Bitrix,
ручная загрузка взаимодействий, PDF (после разрешения на пакеты).

## Фазы и зоны (агенты не пересекаются по файлам)
1. Схема БД: lib/db/schema.ts + drizzle/0284_ai_rop.sql. [zone: schema]
2a. Чистые либы (без БД): lib/ai-rop/{bitrix,bitrix-write,bitrix-im,
    bitrix-activities,transcribe,transcribe-yandex,pii-mask,ner-mask,
    script-templates,knowledge-articles,types}. Конфиг параметром. [zone: libs-pure]
2b. БД-ядро (после 1): lib/ai-rop/{settings,access,rls,pipeline,analyzer,
    ai-provider,product-detector,budget,tokens,interaction-source,importer,
    auto-importer,managers,crm-log,crm-outcome-sync,discrepancy-detector,
    reminders,provider-health}. [zone: libs-db]
2c. Агрегация (после 1): lib/ai-rop/{dashboard-data,team-dynamics,
    objection-clusters,rop-priority,gamification,clients,reports,
    reports-scheduler,dashboard-share,report-views}. [zone: libs-agg]
3. Кроны + вебхук + API-роуты. [zone: api]
4. UI модуля + публичный отчёт + sidebar/registry/middleware. [zone: ui]
5. Админка /admin/platform (токены/тарифы/промо/платежи/статистика). [zone: admin]
6. Сквозная проверка: tsc, build, живой прогон (загрузка записи → транскрипт →
   анализ → дашборд), дифф-матрица «всё ли перенесено», скриншоты.

## Открытые вопросы Юрию (не блокируют, дефолты выбраны)
1. npm-пакеты для PDF (puppeteer-core+@sparticuz/chromium) и .docx (mammoth) —
   добавить? Дефолт: жду «да», фичи в хвосте очереди.
2. NER-сервис (Natasha, маскирование ФИО перед зарубежным AI) на company24-прод
   не установлен — ставить копию с радара? Дефолт: env есть, fail-open как на
   радаре (осознанный компромисс 152-ФЗ, принятый 05.07).
3. Включать ли модуль демо-тенанту сразу после паритета? Дефолт: да, для показа.

## Правила исполнения
- Ветка feat/ai-rop-module (worktree /Users/juri/Projects/mk-ai-rop), НЕ пушить
  в main, деплой только по команде Юрия, перед деплоем predeploy-guard.
- Оригинальный call-agent и market-radar НЕ трогать.
- Новые {{шаблоны}}/тексты — только видимые редактируемые поля, не хардкод.
- Каждая фаза: коммит в ветку сразу (урок rsync-инцидента 07.07).
