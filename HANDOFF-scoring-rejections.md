# HANDOFF — скоринг + отложенные отказы (для нового чата)

> Локальный файл (НЕ коммитить — добавь в .gitignore при желании).
> Дата: 2026-05-30. Ветка develop = прод. Канон стадий: lib/stages.ts.
> Юрий — фаундер, не программист. Правила: всегда писать «РЕКОМЕНДУЮ» в
> предложениях; ETA по каждому шагу; деплой/миграции делает Юрий сам по команде;
> мгновенных вопросов «куда двигаемся» не задавать — идти по плану.

## БОЛЬШАЯ ЦЕЛЬ
Две связанные задачи на вакансии ИП Штумпф «Маркетолог (AI-платформа, B2B)»
(id 3e8d1f6b-b3bf-4f71-8d77-85a3a9344d71, 550 кандидатов, 0 с рубрикой):
A) Качественный AI-скоринг (рубрика по критериям + evidence + подсчёт в коде).
B) Убрать ВСЕ мгновенные авто-отказы → только отложенные (через настраиваемое
   время, в рабочее время вакансии, как сообщение в чат + стадия rejected).

## ПЛАН (порядок согласован Юрием): 1→2→3→4
1. ✅ ЗАХОД 1 — СДЕЛАНО И ЗАДЕПЛОЕНО. Фаза 1 скоринга: убраны Город/Формат из
   критериев оценки (теперь только фильтры), новые дефолт-веса (опыт+навыки=
   Критично), кастомные критерии под вакансию (anketa.aiCustomCriteria,
   произвольное число). Коммиты da6a98d + edee44f в origin/develop. На проде.
   Файлы: lib/scoring/vacancy-spec.ts, components/vacancies/anketa-tab.tsx.

2. ⏳ ЗАХОД 2 — НАПИСАН ЛОКАЛЬНО, НЕ ЗАКОММИЧЕН, НЕ ЗАДЕПЛОЕН. Инфраструктура
   отложенных отказов (механизм есть, точки отказа ещё НЕ переключены — работает
   вхолостую). Build зелёный, tsc чисто. Незакоммиченные файлы:
   - drizzle/0155_pending_rejection.sql — МИГРАЦИЯ (3 поля candidates + индекс)
   - lib/db/schema.ts — те же поля + rejectionDelayMinutes в VacancyAiProcessSettings
   - lib/rejection/execute.ts — НОВЫЙ единый модуль: scheduleRejection /
     executeRejection / cancelScheduledRejection
   - app/api/cron/pending-rejections/route.ts — НОВЫЙ cron (canSendNow + executeRejection)
   - app/api/modules/hr/vacancies/[id]/ai-settings/route.ts — сохранение rejectionDelayMinutes
   - components/vacancies/vacancy-ai-process-settings.tsx — UI поле «Задержка перед
     отказом» + динамич. подсказка (⚡мгновенно при 0 / 🕐через Nч)
   ДЕФОЛТ задержки: 300 мин (5 ч). 0 = мгновенно. Поле per-вакансия.
   ОСТАЛОСЬ ПО ЗАХОДУ 2: закоммитить + Юрий деплоит:
     git pull → применить drizzle/0155 → pnpm build → pm2 reload →
     добавить crontab: */5 * * * * curl -X POST -H "X-Cron-Secret: $CRON_SECRET"
       https://company24.pro/api/cron/pending-rejections
   SQL миграции безопасен (ADD COLUMN IF NOT EXISTS nullable + индекс, идемпотентно).

3. 🟡 ЗАХОД 3 — ЧАСТИЧНО СДЕЛАН (31.05, локально, НЕ закоммичен, НЕ задеплоен).
   Переключены 2 СИСТЕМНЫХ точки отказа на scheduleRejection() (там, где отложить
   однозначно правильно и можно сохранить текст сообщения 1-в-1):
   ✅ lib/prequalification/finalize.ts — провал предквалификации. Больше НЕ ставит
      stage=rejected мгновенно: фиксирует prequalification_status=failed +
      autoProcessingStopped, планирует отказ (generic текст, cron исполнит).
   ✅ lib/hh/process-queue.ts — стоп-факторы (ГЛАВНОЕ). Больше НЕ делает мгновенный
      discard: планирует отказ с СОХРАНЁННЫМ факторным текстом. Для этого:
      - drizzle/0160_pending_rejection_message.sql — НОВАЯ колонка
        candidates.pending_rejection_message (nullable, идемпотентно).
      - lib/db/schema.ts — поле pendingRejectionMessage.
      - lib/hh/sync-stage.ts — trySyncRejectToHh(candidateId, customMessage?) —
        опц. кастомный текст перебивает шаблон вакансии.
      - lib/rejection/execute.ts — scheduleRejection({...message?}) сохраняет текст;
        executeRejection шлёт его (иначе generic). cancelScheduledRejection чистит.
   Build зелёный (BUILD_EXIT=0), tsc по этим файлам чисто.

   ⏸️ ОТЛОЖЕНЫ 2 РАЗГОВОРНЫЕ точки (нужно подтверждение Юрия + тест на стейджинге,
      неверная догадка шлёт реальные сообщения живым людям):
   - lib/hh/scan-incoming.ts:586-596 — кандидат САМ сказал «не интересно» (conf≥0.9).
     Вопрос: стоит ли задерживать наш ответ человеку, который сам отказался? (applyRejection)
   - lib/ai/chatbot-processor.ts — security (injection/мат/нестабильность). Нужна
     семантика «бот СРАЗУ молчит, а отказ по таймеру» — сложнее, чем просто свитч.
     Точки: autoRejectAndNotify (491-541) + stop-word (847-864) + rejection_signal (953-959).
   - ручные HR (candidates/[id]/stage, bulk) — РУЧНОЙ отказ, НЕ трогать (мгнов. ок).
   Авто-reject по AI-баллу УЖЕ выключен (process-queue.ts:612 `if(false)` P0-14).

   ⚠️ ДЕПЛОЙ ЗАХОДА 3 (порядок важен — миграция ДО кода):
   1) git pull origin develop (после коммита)
   2) sudo -u postgres psql -d mykomanda -f drizzle/0160_pending_rejection_message.sql
   3) pnpm build && pm2 reload my-komanda
   ПОСЛЕ деплоя: стоп-факторы и провал предкв больше НЕ отказывают мгновенно —
   ждут rejectionDelayMinutes вакансии (дефолт 300 мин = 5 ч), cron pending-rejections
   (*/5, уже на сервере) исполнит в рабочее время. Это и есть цель Захода 3.

4. ⛔ ЗАХОД 4 — НЕ НАЧАТ. Пере-скор вакансии 3e8d1f6b рубрикой (550 канд. =
   ~550 вызовов Sonnet, ~15-25 мин батчами). Делать ПОСЛЕ заходов 1-3.
   Способ: POST /api/modules/hr/vacancies/3e8d1f6b.../rubric-score-all (батч до 50)
   или дать крону rubric-score доскорить (он берёт rubric_score IS NULL).

## ОТКРЫТЫЙ UX-ВОПРОС (Юрий поднял на скриншоте, разобрать в новом чате)
В анкете «AI-профиль кандидата» сейчас путаница: вверху «Обязательные
компетенции (hard skills)» — много тегов; ниже «Приоритеты оценки» — 5 критериев
+ кастомные. Юрий: «критериев много, какой-то пустой, не пойму как лучше».
Надо продумать UX: развести «обязательные навыки» (это requiredSkills для
промпта) и «критерии оценки с весами» визуально, и сделать добавление кастомных
критериев понятнее. НЕ срочно, обсудить дизайн до правки.

## КАРТА СИСТЕМЫ СКОРИНГА (факты, не диагностировать заново)
- 5 колонок: resume_score (резюме до демо, БОЕВОЙ, старый Haiku screenResume в
  process-queue.ts:518 + hh/client.ts:293), rubric_score (shadow, lib/scoring/
  rubric.ts, Sonnet, ПРАВИЛЬНАЯ система), ai_score (анкета после демо = v2∥v1),
  ai_score_v1 / ai_score_v2 (A/B; v2 гейтован requirementsJson.must_have,
  поэтому 0 строк — фактически мёртв).
- Рубрика lib/scoring/: rubric.ts (движок, forced tool-use, итог считает КОД
  взвешенной суммой), vacancy-spec.ts (buildSpecFromAnketa + buildResumeText),
  types.ts (WEIGHT_VALUES critical=3/important=2/nice=1/irrelevant=0).
- Замеры на проде: симптом «всё в 41-70 / среднее ~50» НЕ воспроизвёлся —
  баллы разнесены. Рубрика проверена на реальных: evidence обоснован, anti-
  hallucination работает. Фаза 1 пересчётом подтвердила: слабые-вытянутые-
  городом просели на 5-15, сильные держатся.
- Консолидация 5→1: НЕ в лоб. resume_score (резюме) и ai_score (анкета) — разные
  стадии, обе нужны. Реальная консолидация = заменить движки внутри на рубрику.
  Это будущее (после отказов).

## ИНФРАСТРУКТУРА (готовое, переиспользовать)
- canSendNow(vacancy) в lib/schedule/can-send-now.ts — рабочее время вакансии.
- trySyncRejectToHh(candidateId) в lib/hh/sync-stage.ts — сообщение+discard на hh
  (сам достаёт токен и текст rejectMessage из вакансии).
- startCronRun/finishCronRun в lib/cron/record-run.ts; checkCronAuth в lib/cron/auth.ts.

## НОЧНОЙ АГЕНТ (отдельная тема, не путать)
Routine night-queue (trig_01E3vbTnJ5kHbL7ntY4hhuAH), cron 0 21 * * * UTC =
00:00 МСК. Очередь: 1) маска телефона 2) cookie-баннер 3) центр кронов этап A.
Очередь — в NIGHT-QUEUE.md И в промпте routine (синхронить оба при смене).
Эта задача (скоринг/отказы) — НЕ ночная, делается интерактивно.
