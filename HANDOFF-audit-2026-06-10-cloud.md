# HANDOFF: аудит и фиксы 10.06.2026 (облачная сессия)

> Для следующей облачной Claude-сессии. Прочитать ПЕРВОЙ, затем CLAUDE.md.
> Прошлая сессия: https://claude.ai/code/session_0182TCVQJVoeWgijRUHtU2aS

## Состояние

- **develop** = `8383954`: два пакета фиксов аудита смерджены (см. ниже).
  main НЕ обновлялся — на проде этих фиксов ещё НЕТ.
- Точка отката: тег `restore-point-2026-06-10` (= eda6abc, прод до фиксов),
  дамп БД и архив uploads — на сервере в /root/backups и на Mac юзера.
- Рабочая ветка прошлой сессии: `claude/project-exploration-uljqpd` (смерджена).

## Что сделано (в develop, ждёт стейджинг-проверки)

**Пакет 1 (24f86a4) — безопасность:**
- УДАЛЁН `/api/ai/key` (отдавал ANTHROPIC_API_KEY любому залогиненному;
  вторая дыра — ключ публично через /api/public/knowledge-chat/context).
  Замена: серверные прокси `/api/ai/messages` (requireCompany) и
  `/api/public/knowledge-chat/answer` (token + rate-limit 30/мин).
  Переведены: hr/library/create, learning/training/[id],
  knowledge-v2/training/[id] (близнецы), ai-assistant-widget, /ask/[code].
- upload-media: невидимый импорт publicDir → каждая загрузка медиа
  кандидатом падала 500. Починено.
- IDOR: billing/invoices PATCH (companyId-фильтр), access-requests
  (теперь requirePlatformOperator из lib/platform/auth), backfill-hh-fields
  (директор ограничен своей компанией).
- process-queue: кросс-тенантный seq-scan остановленных кандидатов → inArray.
- Удалены файлы с реальными PII из корня репо; пароль БД убран из CLAUDE.md.

**Пакет 2 (add9b1a) — устойчивость ядра:**
- scan-incoming: сбой AI больше не теряет сообщения (lastSeenMessageId
  двигается только до последнего обработанного, упавшее ретраится).
- process-queue: ошибка hh при отправке приглашения → отклик остаётся
  в очереди (action=hh_send_failed_retry), а не ложный invited.
- hh-helpers getValidToken: рефреш токена под pg_advisory_xact_lock
  (гонка кронов деактивировала интеграцию).
- pending-rejections: advisory-лок 7470002 на зарезервированном соединении
  (pgClient.reserve) от двойных отказов.
- hard-delete вакансии: транзакция + SAVEPOINT; drift (42P01/42703)
  пропускается, FK пробрасывается; добавлена чистка hh_responses.
- chatbot-квота: атомарный условный инкремент (ON CONFLICT ... WHERE count<limit).
- stageHistory: атомарный jsonb-конкат.

## ПЕРВАЯ ЗАДАЧА новой сессии: проверка стейджинга

Сеть окружения уже открыта (company24.pro, new.company24.pro разрешены).
Стейджинг деплоит юзер на сервере:
`cd /var/www/my-komanda-new-staging && git pull origin develop && pnpm build && pm2 reload my-komanda-new-staging`

Смоук без логина (curl):
- GET https://new.company24.pro/api/ai/key → **404** (роут удалён; 401 = старый код!)
- POST https://new.company24.pro/api/ai/messages → 401
- POST https://new.company24.pro/api/public/knowledge-chat/answer ({}→) 400/401

Браузером (Playwright из репо: `pnpm exec playwright install chromium` +
PLAYWRIGHT_BASE_URL=https://new.company24.pro; тест-аккаунты в CLAUDE.md,
пароли спросить у юзера):
1. HR → Библиотека → создать из документа (AI-разбивка работает)
2. Тренировка с AI-персонажем (отвечает, кнопка не заблокирована)
3. Виджет Ненси в базе знаний
4. Публичный /ask/<код> (код спросить у юзера)
5. Демо кандидата: загрузка видео/аудио-ответа (раньше 500)
6. В Network: НЕТ запросов на api.anthropic.com из браузера

После OK юзера: merge develop→main (проверив git log origin/develop..origin/main),
юзер запускает /root/deploy-prod-safe.sh. ПОСЛЕ прода — ротация ключей:
ANTHROPIC_API_KEY (+Cloudflare Worker, отозвать старый), пароль БД (он был
в git!), CRON_SECRET, PLATFORM_ADMIN_KEY → pm2 reload --update-env.

## Бэклог (согласован с юзером, делать по команде)

**Пакет 3:** индексы hh_responses(company_id,status) / vacancies(company_id,
deleted_at) / demos(vacancy_id,kind); pgTable для ai_chatbot_messages и
ai_chatbot_quota (без смены DDL); мёртвый код (5×`{false &&}` в
candidate-filters.tsx и vacancies/[id]/page.tsx:2386, lib/ai-audit.ts —
сирота); 46 .md из корня → docs/{archive,product,ops}; ротация ночных
дампов на сервере (копятся без удаления с 10.05, +20МБ/день).

**Пакет 4 (каждое — отдельное решение юзера):** завершить A/B скоринга
v1/v2 (сейчас 3 параллельных вызова Claude); шаблоны демо localStorage→БД;
распил гигантов (notion-editor 4553 строк, vacancies/[id]/page 4138,
schema.ts 3088, anketa-tab 2936, demo-client 2156); карточка кандидата
9 табов → условный рендер; drizzle journal (178 миграций мимо journal,
14 дублей номеров — drizzle-kit generate использовать НЕЛЬЗЯ, только
ручные миграции через psql); B9; затем ignoreBuildErrors:false
(осталось ~57 ошибок типов, список: tsc --noEmit).

## Нюансы облачной песочницы

- pnpm нет в PATH: `npx -y pnpm@10 install --frozen-lockfile`
- Сборка: `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npx -y pnpm@10 build`
  (иначе падает на Google Fonts из-за TLS egress-прокси)
- SSH на сервер НЕТ — серверные шаги делает юзер, давать готовые команды
- tsc: только `./node_modules/.bin/tsc --noEmit` (npx tsc = подменный пакет)
- Пуш тегов заблокирован прокси; пуш в develop работает
- Известная мина (не трогали): advisory-лок hh-import делает unlock через
  пул (может уйти в чужое соединение) — при странных вечных busy смотреть сюда
