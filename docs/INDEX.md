# docs/INDEX.md — карта документации my-komanda

> Обновлено: 2026-06-14. Добавлена секция docs/architecture/ (вкл. SCORING-SYSTEMS.md). Ранее (10.06) перемещены 46 файлов из корня репо.
> В корне остались только: README.md, CLAUDE.md, SALES-MODULE-HANDOFF.md, HANDOFF-audit-2026-06-10-cloud.md.

---

## docs/archive/sessions/ — хэндоффы и отчёты прошлых сессий

| Файл | Содержимое |
|---|---|
| [HANDOFF-session-2026-05-31.md](archive/sessions/HANDOFF-session-2026-05-31.md) | Передача сессии 31.05.2026 — что сделано, что в работе |
| [HANDOFF-session-2026-06-01.md](archive/sessions/HANDOFF-session-2026-06-01.md) | Передача сессии 01.06.2026 — инструкция старта нового чата |
| [HANDOFF-session-2026-06-02.md](archive/sessions/HANDOFF-session-2026-06-02.md) | Передача сессии 02.06.2026 — что в проде, что в ветке |
| [HANDOFF-session-2026-06-03.md](archive/sessions/HANDOFF-session-2026-06-03.md) | Передача сессии 03.06.2026 — всё в develop, контекст переполнен |
| [HANDOFF-scoring-rejections.md](archive/sessions/HANDOFF-scoring-rejections.md) | Хэндофф: скоринг + отложенные отказы (для нового чата) |
| [CHECKLIST-deploys-2026-06-01.md](archive/sessions/CHECKLIST-deploys-2026-06-01.md) | Чеклист состояния деплоев на 01.06.2026 |
| [DEBUG-followup-schedule-2026-06-01.md](archive/sessions/DEBUG-followup-schedule-2026-06-01.md) | Расследование: дожим не доходит по расписанию (01.06.2026) |
| [session-1-followup-fix-2026-05-19.md](archive/sessions/session-1-followup-fix-2026-05-19.md) | Сессия 1: фикс cron дожима + оптимизация + чистка (19.05.2026) |
| [session-2-followup-ui-2026-05-19.md](archive/sessions/session-2-followup-ui-2026-05-19.md) | Сессия 2: UI «Дожим» + критические backend-фиксы (19.05.2026) |

---

## docs/ops/ — инструкции по серверу, деплою, инцидентам

| Файл | Содержимое |
|---|---|
| [ci-deploy-setup.md](ops/ci-deploy-setup.md) | Настройка CI/CD GitHub Actions → продовый деплой |
| [DEPLOY-zero-downtime.md](ops/DEPLOY-zero-downtime.md) | План zero-downtime деплоя через cluster + standalone output |
| [CHANGELOG.md](ops/CHANGELOG.md) | История выкатов и изменений с 22.05.2026 |
| [DEFAULT-TEXTS.md](ops/DEFAULT-TEXTS.md) | Каталог всех дефолтных текстов платформы (кандидатам, HR) |

---

## docs/product/ — спецификации фич, ТЗ, видение, планы

| Файл | Содержимое |
|---|---|
| [AUDIT-vacancy-and-hiring-settings.md](product/AUDIT-vacancy-and-hiring-settings.md) | Аудит страницы вакансии + /hr/hiring-settings (30.05.2026) |
| [FLOW-как-работает-платформа.md](product/FLOW-как-работает-платформа.md) | Описание потока найма от публикации вакансии до найма |
| [PLAN-chatbot-autofill-2026-06-01.md](product/PLAN-chatbot-autofill-2026-06-01.md) | План: чат-бот дозаполняет анкету из переписки (01.06.2026) |
| [RESEARCH-outbound-sourcing.md](product/RESEARCH-outbound-sourcing.md) | Исследование: исходящий подбор через hh outbound (31.05.2026) |
| [SALES-DEPLOY-PENDING.md](product/SALES-DEPLOY-PENDING.md) | Модуль продаж — что готово в коде, но не задеплоено |
| [SALES-PROCESS-DECISIONS.md](product/SALES-PROCESS-DECISIONS.md) | Модуль продаж — процессные решения и открытые вопросы |
| [SYSTEM-MAP.md](product/SYSTEM-MAP.md) | Общая схема my-komanda: модули, связи, архитектура (31.05.2026) |
| [TASKS-TRACKER.md](product/TASKS-TRACKER.md) | Трекер отложенных задач (апрель 2026) |
| [TODO-after-migration.md](product/TODO-after-migration.md) | Отложенные задачи после переезда (готово в коде, ждут активации) |
| [TODO.md](product/TODO.md) | Общий список идей и задач (Whisper, AI оценка видео и др.) |
| [TZ-1-razobrat-fixes.md](product/TZ-1-razobrat-fixes.md) | ТЗ-1: критичные фиксы рассылки «Разобрать» (апрель 2026) |
| [TZ-2-hh-card.md](product/TZ-2-hh-card.md) | ТЗ-2: карточка hh.ru на табе «Настройки» вакансии |
| [TZ-3-candidate-card-fixes.md](product/TZ-3-candidate-card-fixes.md) | ТЗ-3: UX-баги карточки кандидата |
| [TZ-4-demo-anketa-fixes.md](product/TZ-4-demo-anketa-fixes.md) | ТЗ-4: UX-баги анкеты и демо-страницы |
| [TZ-5-ai-scoring-followup.md](product/TZ-5-ai-scoring-followup.md) | ТЗ-5: AI-скоринг backend-гейт + воронка дожима |
| [TZ-6-forgot-password-smtp-privacy.md](product/TZ-6-forgot-password-smtp-privacy.md) | ТЗ-6: forgot-password + SMTP + политика конфиденциальности |
| [TZ-8-candidates-list-optimization.md](product/TZ-8-candidates-list-optimization.md) | ТЗ-8: оптимизация скорости списка /hr/candidates |
| [TZ-9-auto-import-working-hours.md](product/TZ-9-auto-import-working-hours.md) | ТЗ-9: автоимпорт hh-откликов с расписанием |
| [TZ-AUTODIALER.md](product/TZ-AUTODIALER.md) | ТЗ: бот-звонарь — демо-модуль для презентации |
| [TZ-B2B-SALES.md](product/TZ-B2B-SALES.md) | ТЗ: B2B-продажи — демо-модуль для презентации |
| [TZ-BOOKING-MVP.md](product/TZ-BOOKING-MVP.md) | ТЗ: модуль бронирования — MVP (слоты по времени) |
| [TZ-CRM-DESIGN.md](product/TZ-CRM-DESIGN.md) | ТЗ: CRM Deals — редизайн под стиль базы знаний |
| [TZ-LOGISTICS-00.md](product/TZ-LOGISTICS-00.md) | ТЗ: переименование модуля «Логистика и склад» → «Склад» |
| [TZ-LOGISTICS-01.md](product/TZ-LOGISTICS-01.md) | ТЗ: новый модуль «Логистика» — структура + настройки |
| [TZ-LOGISTICS-02.md](product/TZ-LOGISTICS-02.md) | ТЗ: дашборд логистики |
| [TZ-LOGISTICS-03.md](product/TZ-LOGISTICS-03.md) | ТЗ: логистика — запросы на расчёт |
| [TZ-LOGISTICS-04.md](product/TZ-LOGISTICS-04.md) | ТЗ: логистика — расчёты и офферы (Procurement-агент) |
| [TZ-LOGISTICS-05.md](product/TZ-LOGISTICS-05.md) | ТЗ: логистика — активные перевозки (Execution-агент) |
| [TZ-LOGISTICS-06.md](product/TZ-LOGISTICS-06.md) | ТЗ: логистика — база перевозчиков |
| [TZ-MARKETING-DASHBOARD.md](product/TZ-MARKETING-DASHBOARD.md) | ТЗ: модуль маркетинг — дашборд для презентации |
| [TZ-QC.md](product/TZ-QC.md) | ТЗ: ОКК (контроль качества) — демо-модуль для презентации |
| [TZ-SIDEBAR-CUSTOMIZATION.md](product/TZ-SIDEBAR-CUSTOMIZATION.md) | ТЗ: кастомизация сайдбара — видимость модулей и пунктов |

---

## docs/archive/unsorted/ — служебные / неопознанные файлы

| Файл | Содержимое |
|---|---|
| [CLAUDE_CODE_TASK.md](archive/unsorted/CLAUDE_CODE_TASK.md) | Задание для Claude Code: прототип конфигуратора Company24 |

---

## docs/ (корень docs/) — уже существовавшие файлы, не перемещались

| Файл | Содержимое |
|---|---|
| [AVITO-INTEGRATION-PLAN.md](AVITO-INTEGRATION-PLAN.md) | План интеграции с Avito (канал для HR+продажи) |
| [B9-STATUS-UNIFICATION-PLAN.md](B9-STATUS-UNIFICATION-PLAN.md) | План устранения двух систем статусов кандидатов (баг B9) |
| [CLIENT-OUTBOUND-RESUME-ACCESS.md](CLIENT-OUTBOUND-RESUME-ACCESS.md) | Доступ клиента к резюме в исходящем подборе |
| [COMPANY24-HR-FULL-MANUAL.md](COMPANY24-HR-FULL-MANUAL.md) | Полное руководство по HR-модулю Company24 |
| [employer_negotiations.md](employer_negotiations.md) | Заметки о переговорах с работодателями |
| [smtp-setup.md](smtp-setup.md) | Настройка SMTP для отправки писем |

## docs/architecture/ — архитектура, бэклог, роадмап, скоринг

| Файл | Содержимое |
|---|---|
| [00-START-HERE.md](architecture/00-START-HERE.md) | Точка входа в архитектурную документацию |
| [SCORING-SYSTEMS.md](architecture/SCORING-SYSTEMS.md) | ⭐ Три системы оценки кандидата (AI-резм./AI-оцен./Рубрика): когда что считается, что влияет на воронку |
| [BIG-PICTURE.md](architecture/BIG-PICTURE.md) | Общая картина платформы |
| [PRODUCT-VISION.md](architecture/PRODUCT-VISION.md) | Продуктовое видение |
| [MODULE-MAP.md](architecture/MODULE-MAP.md) | Карта модулей |
| [DESIGN-REFERENCE.md](architecture/DESIGN-REFERENCE.md) | Эталон дизайна (стиль /hr/calendar) |
| [DECISIONS.md](architecture/DECISIONS.md) | Зафиксированные решения |
| [OPEN-QUESTIONS.md](architecture/OPEN-QUESTIONS.md) | Открытые вопросы |
| [MASTER-BACKLOG.md](architecture/MASTER-BACKLOG.md) | Главный бэклог |
| [ROADMAP-ETA.md](architecture/ROADMAP-ETA.md) | Роадмап с оценками сроков |
| [TASK-QUEUE.md](architecture/TASK-QUEUE.md) | Очередь задач |
| [BUGS-AND-QUICKWINS.md](architecture/BUGS-AND-QUICKWINS.md) | Баги и быстрые победы |
| [REQUIREMENTS-CHECKLIST.md](architecture/REQUIREMENTS-CHECKLIST.md) | Чеклист требований |
| [SPEC-funnel-scoring-consolidation.md](architecture/SPEC-funnel-scoring-consolidation.md) | Спецификация консолидации воронки и скоринга (R4 Spec) |
| [FUNNEL-TABS-AUDIT.md](architecture/FUNNEL-TABS-AUDIT.md) | Аудит табов воронки |
| [PHASE0-funnel-parity.md](architecture/PHASE0-funnel-parity.md) · [PHASE1-PLAN.md](architecture/PHASE1-PLAN.md) · [PHASE3-RUNBOOK.md](architecture/PHASE3-RUNBOOK.md) | Этапы консолидации воронки |
| [ROLES-VISIBILITY-ANALYSIS.md](architecture/ROLES-VISIBILITY-ANALYSIS.md) | Анализ ролей и видимости |
| [STATUS-INTAKE.md](architecture/STATUS-INTAKE.md) · [intake-notes.md](architecture/intake-notes.md) | Интейк (спецификация вакансии) |
| [TASKS-calendar.md](architecture/TASKS-calendar.md) · [TASKS-hiring-settings.md](architecture/TASKS-hiring-settings.md) · [TASKS-talent-pool.md](architecture/TASKS-talent-pool.md) · [TASKS-vacancy-editor.md](architecture/TASKS-vacancy-editor.md) | Задачи по разделам |
| [ROLLBACK-RUNBOOK.md](architecture/ROLLBACK-RUNBOOK.md) · [WILDCARD-SUBDOMAIN-RUNBOOK.md](architecture/WILDCARD-SUBDOMAIN-RUNBOOK.md) | Раннбуки (откат, wildcard-поддомены) |
| HANDOFF-2026-06-04-* · [HANDOFF-2026-06-05-FULL.md](architecture/HANDOFF-2026-06-05-FULL.md) · [SESSION-2026-06-03-EVENING.md](architecture/SESSION-2026-06-03-EVENING.md) · [PARALLEL-WORK-STATUS.md](architecture/PARALLEL-WORK-STATUS.md) | Хэндоффы и статусы сессий |

## docs/audit/ и docs/audits/ — аудиты (уже существовали)

Файлы в `docs/audit/` и `docs/audits/` не перемещались.

## docs/ops/ (до перемещения уже существовал)

- `ci-deploy-setup.md` — существовал до этой задачи
- Добавлены: CHANGELOG.md, DEFAULT-TEXTS.md, DEPLOY-zero-downtime.md

## docs/transcripts/ — уже существовал

- `2026-04-27-session-summary.md` — конспект сессии апрель 2026
