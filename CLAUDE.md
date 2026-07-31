# CLAUDE.md — my-komanda / Company24.pro

## Словарь (для устранения путаницы)

ВЕТКА (Git):
- develop — для разработки и стейджинга
- main — для прода

СРЕДА:
- Локально — мой Mac, ~/Projects/my-komanda
- Стейджинг — new.company24.pro (запускается из ветки develop)
- Прод — company24.pro (запускается из ветки main)

ДОМЕН:
- company24.pro → Прод
- new.company24.pro → Стейджинг

ТЕХНИЧЕСКОЕ:
- Прод: /var/www/my-komanda + PM2 my-komanda (порт 3000)
- Стейджинг: /var/www/my-komanda-new-staging + PM2 my-komanda-new-staging (порт 3001)

ПРАВИЛО:
- Код → "ветка develop/main"
- Среда → "стейджинг/прод"
- Браузер → "new.company24.pro / company24.pro"

## Стек
Next.js 16.1.6 (App Router), TypeScript, Tailwind, shadcn/ui, pnpm, PostgreSQL 16, Drizzle ORM (НЕ Prisma)

## Инфраструктура
- Прод: 5.42.125.91, /var/www/my-komanda, PM2 my-komanda:3000
- БД: postgresql://mykomanda:<пароль в .env на сервере>@localhost:5432/mykomanda
- Ветки: develop (разработка) → merge в main → деплой с main. main = прод-ветка.
- GitHub: github.com/jstumpfde/my-komanda
- AI прокси: CLAUDE_PROXY_URL=https://claude-proxy.jstumpf-de.workers.dev

## Команды
- pnpm dev — локальная разработка
- pnpm build — проверка сборки перед коммитом
- kill $(lsof -t -i:3000) 2>/dev/null; pnpm dev — если порт занят

## КРИТИЧЕСКИЕ ПРАВИЛА

### Поведение сессии (для ВСЕХ чатов — фидбэк Юрия 02.07.2026)
- **ВРЕМЯ**: из контекста ты знаешь только дату, НЕ время суток. Перед любым
  «утро/вечер», «Юрий спит», выбором окна деплоя — выполни `date` и смотри на
  факт. Не путай вечер с утром.
- **НЕ ЖДАТЬ**: не задавай Юрию выбор «А или Б?» и не жди ответа, если можешь
  решить сам. Дал варианты и тишина ~5 минут → выбери лучший по своему анализу,
  сделай, отчитайся ретроспективно. Юрий отходит/спит — работа не должна стоять.
- **Задание «на ночь»** = цикл до результата: сделал → проверил → следующий
  пункт очереди, без пауз «жду добро». Утром — один сводный отчёт.
- Вопрос Юрию — только настоящая развилка (деньги, необратимость, вкусовое
  продуктовое решение). И даже тогда: предложи дефолт и параллельно продолжай
  остальные пункты.
- **Показ результата**: не отправлять Юрия «посмотреть» без собственной
  визуальной проверки; прикладывать скриншот того, что он увидит. Участие
  Юрия сводить к одному «да/нет».
- **МОДЕЛИ АГЕНТОВ (экономия токенов, решение Юрия 02.07)**: главный
  цикл/концепции/координация — модель сессии; агенты-исполнители (реализация,
  разведки, миграции, UI) — `model: "sonnet"` (Sonnet 5); сложное рассуждение
  в агентах (адверс-проверки, архитектурный разбор), если Sonnet не тянет —
  `model: "opus"`; тривиальная механика — `model: "haiku"`. Fable в субагентах
  НЕ использовать. В Workflow-скриптах прописывать model у agent() явно.

### Git
- Рабочая ветка: develop. Прод-ветка: main. Перед мерджем develop → main всегда проверять `git log develop..origin/main` — на проде могут быть hotfix-коммиты, которых нет в develop (их нужно подтянуть в develop перед мерджем).
- НИКОГДА не пушить в main напрямую
- НИКОГДА не делать git pull origin main без проверки git log origin/main..HEAD
- Параллельной работой управляет координатор (главный чат). Запрещены только
  НЕскоординированные параллельные сессии (два независимых интерактивных
  Claude-чата, оба пушат/деплоят → гонка за build-lock, инцидент 07.06.2026).
  РАЗРЕШЕНО: координатор запускает несколько фоновых агентов параллельно,
  ЕСЛИ их зоны (файлы/модули) не пересекаются; координатор распределяет
  непересекающиеся зоны и сам разруливает мерджи. Деплой — всегда
  централизованно через координатора, агенты не деплоят и не пушат в main.
- Перед началом работы: git status && git log --oneline -3

### Код
- ORM: Drizzle. Схема в lib/db/schema.ts
- Перед написанием API: проверить реальные колонки через \d tablename в psql
- Auth import: "@/auth" (не "@/lib/auth")
- Пути с (modules) в bash — в одинарных кавычках
- vacancies.status в БД = 'published' (не 'active') — но у Орлинка = 'active', не трогать

### Деплой
- **Стандарт деплоя с 02.07.2026 — blue-green (ноль простоя)**: рецепт по шагам
  в скилле company24-deploy (теневая сборка в /var/www/mk-shadow с
  NEXT_PUBLIC_BUILD_ID=git-sha → зелёный инстанс :3002 → переключение nginx без
  разрыва → своп .next → трафик обратно). Проверено 02.07: три выката при живых
  кандидатах, 0×5xx.
- Fallback — `/root/deploy-prod-safe.sh` (НЕ ручной git reset && build); он
  мигает на pm2 reload несколько секунд.
  Скрипт: проверяет чистоту дерева и ветку=main, дамп БД, pnpm install,
  собирает в свежий `.next` (старый → `.next-prev` для отката), при падении
  сборки откатывает и прод НЕ ложится, затем `pm2 reload` + health-check.
- **Запускать скрипт в фоне с поллингом** (Bash run_in_background или nohup),
  чтобы таймаут не оборвал ssh и не оставил осиротевший `next build`,
  держащий build-lock (причина гонок и 502, инцидент 07.06.2026).
- Ручной `ssh tz "... git reset --hard ... && pnpm build && pm2 reload"` —
  только как fallback, если safe-скрипт недоступен.
- НЕ пушить, НЕ деплоить самостоятельно без явной команды
- **Всегда `pm2 reload` (НЕ `restart`)** — restart убивает процесс и даёт ~5-8 сек простоя, кандидаты ловят «не работает».
- **НИКОГДА `rm -rf .next` на живом проде в рабочее время** — старый процесс раздаёт чанки из `.next`, удаление их ломает страницы у тех, кто уже на сайте (инцидент 02.06.2026). `rm -rf .next` — только при рассинхроне сборки и только вне пиковых часов кандидатов.
- Полный zero-downtime (cluster + output:standalone, reload по очереди инстансов) — отдельная задача, обкатать сначала на стейджинге.

### Тестирование
- После каждого изменения фронта: использовать playwright MCP для проверки в браузере
- URL прода: https://company24.pro
- Тестовый аккаунт: j.stumpf@yandex.ru (компания ИП Штумпф), j.stumpf@ya.by (Орлинк)

### Стиль кода
- Все тексты на русском
- shadcn/ui + Tailwind, без отдельных CSS файлов
- Не добавлять новые npm пакеты без явного разрешения
- Не трогать файлы не упомянутые в задаче

## Архитектура
app/(auth)/           — вход/регистрация
app/(public)/         — публичные страницы (демо кандидата, вакансия)
app/(platform)/       — основные страницы платформы
app/(modules)/        — модули (hr/*, marketing/*, ...)
app/(admin)/          — панель администратора
app/api/              — API роуты

lib/db/schema.ts      — Drizzle схема (источник правды)
lib/hh/               — hh.ru интеграция
lib/ai-screen-candidate.ts — AI скоринг кандидатов
hooks/use-candidates.ts    — хук пагинации кандидатов

## Активные баги (не трогать без задачи)
- B3: дубли кандидатов у Орлинка (партия из 50 закрыта 27.05; следить за рецидивами)
- B9: две параллельные системы статусов кандидатов
- Закрыто 10.06: B5 (колонки теперь company-level в hiring_defaults_json, настраивает
  директор), B6 (фильтры списка уходят в API серверно). B8 — не баг: порядок табов
  вакансии намеренный (решение Юрия).

## Platform-level operations (Group 14)

Скрытый раздел /admin/platform и набор API-эндпоинтов для платформенного
администратора. Эндпоинты защищены заголовком X-Platform-Admin-Key (значение
из env PLATFORM_ADMIN_KEY). UI защищён списком email в PLATFORM_ADMIN_EMAILS
(разделитель ","), при несовпадении возвращается 404 (не 403 — скрываем).

### Env переменные
- PLATFORM_ADMIN_KEY — секрет для curl-ов на /api/platform/*
- PLATFORM_ADMIN_EMAILS — белый список email через запятую для /admin/platform

### Settings migrations runner
Идемпотентные миграции данных/настроек, журнал — таблица
platform_settings_migrations. Список миграций — в
lib/platform/settings-migrations.ts (SETTINGS_MIGRATIONS).

```bash
curl -X POST https://company24.pro/api/platform/run-migrations \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"
```

### Emergency broadcast
Срочные действия на всех компаниях. Каждое логируется в
platform_emergency_actions.

```bash
# Аварийно вырубить AI-чат-бот у всех компаний (companies.ai_chatbot_killed=true)
curl -X POST https://company24.pro/api/platform/emergency/kill-all-ai-chatbots \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"

# Восстановить
curl -X POST https://company24.pro/api/platform/emergency/restore-all-ai-chatbots \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"

# Добавить стоп-слово всем вакансиям, где его ещё нет
curl -X POST https://company24.pro/api/platform/emergency/add-stop-word \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"word":"спасибо за общение"}'

# Сбросить ai_chatbot_prompt у всех вакансий с включённым AI чат-ботом
curl -X POST https://company24.pro/api/platform/emergency/regenerate-ai-prompts \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY"
```

### Admin UI
Открыть https://company24.pro/admin/platform под аккаунтом из
PLATFORM_ADMIN_EMAILS. Табы:
1. **Migrations** — список SETTINGS_MIGRATIONS, идемпотентный runner
2. **Companies** — все компании платформы с счётчиками вакансий/AI
3. **AI Vacancies** — активные вакансии с включённым AI чат-ботом
4. **Emergency** — четыре broadcast-действия с двойным подтверждением (ввод «CONFIRM»):
   - Kill all AI chatbots / Restore all
   - Add global stop word
   - Force regenerate all AI prompts
5. **Logs** — последние 50 записей platform_emergency_actions
6. **Templates** — mining воронки из существующей вакансии или ручное создание platform-шаблона

Tables: platform_settings_migrations, platform_emergency_actions, platform_funnel_templates

## AI Chatbot Architecture (Group 22)

4-уровневая security-архитектура AI чат-бота:

1. **Executor (Sonnet 4.6)** — главный респондер, использует vacancy.aiChatbotPrompt
2. **Pre-filter (Haiku)** — проверяет входящие сообщения кандидата ДО Executor
   - Категории: injection / code / abuse
   - Настраиваемая чувствительность к abuse: soft (0.9) / moderate (0.7) / strict (0.5)
   - Настраиваемое действие при abuse: escalate / needs_review / auto_reject / warn_and_continue
3. **Post-filter (Haiku)** — проверяет ответ Executor ДО отправки кандидату
   - Блокирует: unauthorized_promise / system_leak / role_break / offtopic
4. **AI Watcher** — периодический аудит последних 20 сообщений на вакансию
   - Ручной триггер: POST /api/modules/hr/vacancies/[id]/ai-chatbot/watcher-audit
   - Cron-эндпоинт: GET/POST /api/cron/ai-chatbot-watcher (Группа 34):
     - Cooldown 30 мин между запусками (проверяется по cron_runs)
     - Activity guard: пропускает если за час было <50 сообщений
     - Логируется в cron_runs (startCronRun/finishCronRun)
   - Расписание на сервере (crontab — раз в час):
     ```
     0 * * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
       https://company24.pro/api/cron/ai-chatbot-watcher \
       >> /var/log/ai-watcher.log 2>&1
     ```

Kill switch:
- Per-vacancy: vacancy.aiChatbotEnabled
- Per-company: companies.aiChatbotKilled (перекрывает все вакансии)
- Platform-wide: POST /api/platform/emergency/kill-all-ai-chatbots

Abuse history с undo:
- GET /api/modules/hr/vacancies/[id]/ai-chatbot/abuse-history
- POST /api/modules/hr/vacancies/[id]/ai-chatbot/undo-action

## AI Chatbot Sandbox (Group 33)

Внутренний тестовый режим без cron и hh.ru. HR-настройки → AI чат-бот →
кнопка «Тестировать» в шапке открывает песочницу:

- POST /api/modules/hr/vacancies/[id]/ai-chatbot/sandbox-message
  Body: { message, history: [{role, content}] }
- Прогоняет processChatbotMessage с dryRun=true:
  - НЕ пишет в БД (candidates, ai_chatbot_messages)
  - НЕ уведомляет HR и Telegram
  - НЕ инкрементирует quota, не блокирует ping-pong/daily-limit
  - Контекст pre-filter берётся из переданной UI истории
- Возвращает action/reply/category/confidence/escalationReason/тайминги +
  диагностику (триггеры, responseTiming, rejectionMessages).

UI имитирует тайминги (cap 8 сек, реальные до 5 мин). Под каждым
ответом AI — бэдж action + категория + confidence + reason.

## Response Timing (Group 33)

В aiChatbotSettings.responseTiming:
- delaySeconds (1-300) — задержка перед основным reply
- enableShortMessages — двойные сообщения
- shortMessages[] — пул шаблонов («Минутку, посмотрю...»)
- maxShortMessagesPerDialog (1-10)
- shortToMainDelaySeconds (3-60)

processor возвращает preMessage + preMessageDelayMs + replyDelayMs в
ProcessResult; scan-incoming выполняет sleep'ы (cap 60 сек, чтобы один
кандидат не блокировал cron). Счётчик коротких — candidates.short_
messages_sent_count (миграция 0135).

## Funnel Builder (Group 22)

Визуальный drag-and-drop конструктор воронки на 17 блоков (feature flag: vacancy.funnelBuilderEnabled).

Типы блоков: ai_resume_score, stop_factors_resume, first_message, prequalification, demo, video_intro, anketa, ai_anketa_score, auto_reply_test_task, stop_words_chat, dozhim, ai_chatbot, interview, thank_you_screen, test_task, reference_check, offer.

Реестр настроек: lib/funnel-builder/block-settings.tsx — мапит тип блока на React-компонент, открываемый в Sheet по клику на шестерёнку.

Шаблоны:
- **Built-in** (захардкожены в lib/funnel-builder/blocks.ts): simple / with_test / with_chatbot / full / full_with_test
- **Company-level** (таблица company_funnel_templates) — HR создаёт и применяет к вакансиям; один default на компанию
- **Platform-level** (таблица platform_funnel_templates) — Юрий публикует через Platform Admin → Templates; видно всем HR через /api/modules/hr/funnel-templates/platform

Dual-write: при сохранении funnel config HR-ом legacy-поля (aiChatbotEnabled, aiScoringEnabled, aiProcessSettings.*) тоже обновляются — существующие cron-ы работают без рефакторинга.

## Stop Factors (Group 22)

Per-vacancy стоп-факторы в vacancy.stopFactorsJson:
- city / format / age / experience / documents / citizenship / salaryExpectation

Автоматически применяются в lib/hh/process-queue.ts ДО AI-скоринга через lib/funnel-builder/stop-factors-matcher.ts. При совпадении:
1. Отправить отказ через hh discard_by_employer
2. Пометить стадию кандидата как rejected
3. Поставить autoProcessingStoppedReason = "stop_factor:{factor}"

## Яндекс.Директ AI-агент (модуль marketing)

Страница /marketing/yandex-direct (пункт меню «Яндекс.Директ»). Агент:
создаёт кампании на поиске и в РСЯ из брифа (Claude Sonnet → черновик →
редактирование → публикация через API Директа v5), синкает кампании и
дневную статистику, оптимизирует (пауза фраз-пожирателей, минус-слова,
ставки, бюджеты) в двух режимах — recommend / autopilot.

- Код: lib/yandex-direct/ (oauth, client — API v5 + Reports, sync,
  generate-campaign, publish-campaign, agent)
- OAuth: /api/integrations/yandex-direct/auth + callback (по образцу hh)
- API: /api/modules/marketing/yandex-direct/* (overview, sync, generate,
  publish, agent, agent/[id], settings)
- Таблицы: yandex_direct_integrations, yandex_direct_campaigns,
  yandex_direct_campaign_stats, yandex_direct_agent_actions (миграция 0202)
- Деньги в БД — рубли; в микроединицы API (×1 000 000) конвертирует client.ts
- Автопилот применяет только безопасные действия (pause_keyword,
  add_negative_keywords, set_keyword_bid с потолком maxCpc); pause_campaign
  и set_daily_budget — всегда вручную кнопкой «Применить». publish и
  settings — requireDirector
- Env: YANDEX_DIRECT_CLIENT_ID, YANDEX_DIRECT_CLIENT_SECRET,
  YANDEX_DIRECT_REDIRECT_URI (https://company24.pro/api/integrations/yandex-direct/callback),
  YANDEX_DIRECT_SANDBOX=true — песочница Директа
- Cron (cooldown 4 ч, лог в cron_runs):
  ```
  0 3,9,15,21 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
    https://company24.pro/api/cron/yandex-direct-agent \
    >> /var/log/yandex-direct-agent.log 2>&1
  ```

## Environment Variables

- DATABASE_URL — postgresql://mykomanda:<пароль в .env на сервере>@localhost:5432/mykomanda
- NEXTAUTH_SECRET — secret for next-auth sessions
- ANTHROPIC_API_KEY — для AI чат-бота, скоринга, watcher
- CLAUDE_PROXY_URL — https://claude-proxy.jstumpf-de.workers.dev
- PLATFORM_ADMIN_KEY — секрет для emergency broadcast эндпоинтов
- PLATFORM_ADMIN_EMAILS — comma-separated emails, кто видит /admin/platform
- CRON_SECRET — для авторизации cron-эндпоинтов
- HH_CLIENT_ID / HH_CLIENT_SECRET — hh.ru OAuth
- YANDEX_DIRECT_CLIENT_ID / YANDEX_DIRECT_CLIENT_SECRET / YANDEX_DIRECT_REDIRECT_URI — OAuth Яндекс.Директа
- YANDEX_DIRECT_SANDBOX — true = песочница API Директа

## Корзина вакансий (Trash)

Три уровня состояний вакансии (lib/vacancies/lifecycle.ts):
- Активные (active/paused) — таб «Активные»
- Архив (archived/closed*) — таб «Архив», бессрочно
- Корзина (deleted_at IS NOT NULL) — таб «Корзина», авто-удаление через
  companies.trash_retention_days (по умолчанию 30; настройка — HR → Настройки
  найма → Сообщения → «Корзина — срок хранения»). Признак корзины — deleted_at
  (отдельной status='trashed' НЕ вводим).

«Удалить навсегда» и cron удаляют зависимые строки (кандидаты/демо/hh) ДО
вакансии (lib/vacancies/hard-delete.ts) — FK NO ACTION иначе блокируют delete.
Кандидаты привязаны к вакансии один-к-одному, поэтому не затрагивают другие.

Cron авто-удаления — /api/cron/trash-cleanup (раз в сутки, 03:00 МСК):
```
0 0 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://company24.pro/api/cron/trash-cleanup \
  >> /var/log/trash-cleanup.log 2>&1
```
(00:00 UTC = 03:00 МСК; логируется в cron_runs.)

## Кандидаты-призраки (демо-визиты)

`/api/public/demo/[token]/visit` — bounce-роут, создающий кандидата на
анонимный визит по referral-ссылке (нет валидной куки myk_candidate_uuid под
уже существующего кандидата). Два механизма против мусора (13.07, 35 строк
вычищено вручную на проде):
- **Staff preview** — если запрос залогинен в платформу под сотрудником
  компании-владельца вакансии (или платформенным админом), кандидат НЕ
  создаётся вовсе — редирект на read-only `?as=hr` preview
  (lib/public/staff-preview.ts).
- **Авто-очистка** остального (боты/брошенные визиты) — крон
  /api/cron/ghost-candidate-cleanup, критерий lib/candidates/ghost-cleanup.ts,
  удаление — lib/candidates/hard-delete-ids.ts (та же логика, что bulk
  hard_delete у HR).

Cron — раз в сутки, следом за trash-cleanup (00:30 UTC = 03:30 МСК):
```
30 0 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://company24.pro/api/cron/ghost-candidate-cleanup \
  >> /var/log/ghost-candidate-cleanup.log 2>&1
```

## Отчёт по найму (/hr/report)

Сводная аналитика по вакансиям компании. Агрегация — lib/hr/build-report.ts
(используют и приватный, и публичный API), визуал — components/hr/report-view.tsx
(общий компонент для приватной и публичной страниц).

- **Фильтры:** период (today/yesterday/this_week/last_week/this_month/last_month/all
  + кастомный диапазон from/to с календаря) и дропдаун вакансии. «Период: …» и кнопка
  «Поделиться» — в шапке справа.
- **Таблица «По вакансиям»:** Статус (наш цикл + hh-архив + дата закрытия), Опубл.
  (дней от created_at), Анкет (anketa_filled), Собес., Решение (decision), Нанято,
  Отказов, Сам отказ. (rejectionInitiator=candidate).
- **Причины отказа:** автоматические (auto_processing_stopped_reason → русские ярлыки
  в lib/hr/rejection-reasons.ts) + ручная таксономия + инициатор.
- **Захват на карточке:** причина отказа (candidates.rejection_*) и созвоны
  (таблица candidate_contacts, lib/hr/contacts.ts).

### Публичная ссылка (share)
Таблица report_shares (один активный токен на компанию). API:
- GET/POST/DELETE /api/modules/hr/report/share (создание/отзыв — requireDirector)
- GET /api/public/report/[token] — чтение без логина (период/вакансия в query)
- Страница /report/[token] (в PUBLIC_PREFIXES middleware). ?tv=1 — TV-режим
  (крупно, авто-обновление раз в минуту, без панели фильтров).

### Статус вакансии: hh-архив vs наше закрытие
vacancies: hh_archived, hh_expires_at, closed_at (миграция 0195).
- closed_at пишется в PUT /api/modules/hr/vacancies/[id] при переводе в архив.
- hh_archived обновляет крон /api/cron/hh-vacancy-sync: archived берём из ДЕТАЛИ
  /vacancies/{id} (НЕ из /vacancies/active — он у части работодателей пуст и
  пометил бы всё архивом). 404 от hh = вакансия удалена → архив. hh точную дату
  истечения работодателю не отдаёт. Расписание (раз в сутки, 05:30 МСК):
```
30 2 * * * curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  https://company24.pro/api/cron/hh-vacancy-sync >> /var/log/hh-vacancy-sync.log 2>&1
```

Таблицы: report_shares, candidate_contacts. Миграции 0192–0195.

## Deployment Commands

Стандартный деплой (после мерджа feature-ветки в develop):

На Mac:
```bash
cd /Users/juri/Projects/my-komanda
git checkout develop
git pull origin develop
git merge --no-ff feature/branch-name -m "merge: ..."
pnpm build
git push origin develop
```

На сервере (5.42.125.91):
```bash
cd /var/www/my-komanda
git pull origin develop
# Если есть миграция:
sudo -u postgres psql -d mykomanda -f /var/www/my-komanda/drizzle/NNNN_*.sql
pnpm build
pm2 reload my-komanda --update-env  # --update-env когда менялись ENV
curl -s -o /dev/null -w "HTTP %{http_code}\n" https://company24.pro/hr/vacancies
```

## TODO (актуально на 04.06.2026)
- [x] Подтянуть коммиты main→develop — нечего тянуть, develop уже содержит всё с main (04.06).
- [x] Удалить старую ветку deploy/pagination-clean (локально и на remote) (04.06).
- [x] Удалить старую ветку feat/pagination-v1 (04.06).
- [x] Перевести стейджинг new.company24.pro на develop — уже на develop (upstream origin/develop).
