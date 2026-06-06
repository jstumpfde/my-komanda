# PHASE 3 — Runbook переключения рантайма на Funnel Builder

> Цель: рантайм найма читает enabled блоков из `funnelConfigJson`, когда у вакансии
> включён НОВЫЙ флаг `funnel_runtime_enabled` (по умолчанию false). Иначе — legacy
> побайтово как раньше. Включаем ТОЛЬКО на полигоне «Помощник по маркетингу»
> (id `5ae8f734-b468-46fc-88f9-69ed662879ed`). Обратимо.

## Что в коде (develop, ждёт вечернего деплоя)
- `drizzle/0166_funnel_runtime_enabled.sql` — новая колонка `funnel_runtime_enabled`.
- `lib/db/schema.ts` — поле `funnelRuntimeEnabled`.
- `lib/funnel-builder/runtime.ts` — адаптер `isBlockEnabled(vacancy, type, legacyValue)`.
- Обёрнуты 5 гейтов (4 блока):
  - `ai_chatbot`: scan-incoming (запуск бота) + process-queue (off-hours soft mode).
  - `stop_factors_resume`: process-queue (применять стоп-факторы по резюме).
  - `stop_words_chat`: should-stop (кастомные стоп-слова в чате).
  - `auto_reply_test_task`: anketa-auto-reply (автоответ с тест-заданием).
- НЕ гейтили: `ai_resume_score` (скоринг рантаймом НЕ гейтится на aiScoringEnabled —
  проверено grep'ом, гейта нет), `recovery`/`test_quiz`/`dozhim`/`prequalification`/
  `interview`/`thank_you_screen`/`ai_anketa_score` — их рантайм-гейты либо отсутствуют,
  либо читаются как настройки (не вкл/выкл блока). Для них адаптер всё равно даст
  fallback на legacy, если блок есть. Расширим в следующих заходах при необходимости.

## ⚠️ Расхождение config↔legacy на полигоне (устранить ДО включения флага)
Блок `ai_chatbot` в `funnel_config_json` = **enabled:false**, а колонка
`ai_chatbot_enabled` = **true** (бот включён прямым SQL 04.06, минуя dual-write).
Если включить `funnel_runtime_enabled` без сверки — бот молча выключится.
Остальные гейт-блоки сходятся (проверено: stop_factors=false/false, stop_words=false/false,
first_message on, dozhim on).

## ПОСЛЕДОВАТЕЛЬНОСТЬ НА ВЕЧЕР (по порядку)

### 0. Дамп БД (обязательно — трогаем живую вакансию)
```bash
ssh tz "pg_dump 'postgresql://mykomanda:Comp2024!@localhost:5432/mykomanda' -Fc -f ~/mykomanda-\$(date +%F).dump"
```

### 1. Деплой кода + миграция (миграция ДО билда — select тянет новую колонку)
```bash
ssh tz "cd /var/www/my-komanda && git pull origin develop \
  && sudo -u postgres psql -d mykomanda -f drizzle/0166_funnel_runtime_enabled.sql \
  && pnpm build && pm2 reload my-komanda --update-env"
```

### 2. Проверка паритета на полигоне (config.enabled vs legacy для гейт-блоков)
```bash
ssh tz "sudo -u postgres psql -d mykomanda -x -c \"
SELECT
  (SELECT b->>'enabled' FROM jsonb_array_elements(funnel_config_json->'blocks') b WHERE b->>'type'='ai_chatbot')          AS cfg_chatbot,
  ai_chatbot_enabled                                                                                                       AS legacy_chatbot,
  (SELECT b->>'enabled' FROM jsonb_array_elements(funnel_config_json->'blocks') b WHERE b->>'type'='stop_factors_resume')  AS cfg_stopfactors,
  (ai_process_settings->>'stopFactorsEnabled')                                                                             AS legacy_stopfactors,
  (SELECT b->>'enabled' FROM jsonb_array_elements(funnel_config_json->'blocks') b WHERE b->>'type'='stop_words_chat')      AS cfg_stopwords,
  (ai_process_settings->>'stopWordsChatEnabled')                                                                          AS legacy_stopwords,
  (SELECT b->>'enabled' FROM jsonb_array_elements(funnel_config_json->'blocks') b WHERE b->>'type'='auto_reply_test_task') AS cfg_autoreply,
  (ai_process_settings->>'testTaskAutoReplyEnabled')                                                                      AS legacy_autoreply
FROM vacancies WHERE id='5ae8f734-b468-46fc-88f9-69ed662879ed'\""
```
Сверить: для каждого блока cfg ≈ legacy (с учётом «null/отсутствие legacy = включено»).
Ожидаемое расхождение — только chatbot (cfg=false, legacy=true) → чиним шагом 3.

### 3. Reconcile: блок ai_chatbot → true (намерение Юрия = бот ВКЛ)
```bash
ssh tz "sudo -u postgres psql -d mykomanda -c \"
UPDATE vacancies SET funnel_config_json = jsonb_set(funnel_config_json, '{blocks}',
  (SELECT jsonb_agg(CASE WHEN b->>'type'='ai_chatbot' THEN jsonb_set(b,'{enabled}','true') ELSE b END)
   FROM jsonb_array_elements(funnel_config_json->'blocks') b))
WHERE id='5ae8f734-b468-46fc-88f9-69ed662879ed'\""
```
Повторить шаг 2 — теперь chatbot cfg=true=legacy. Паритет полный.

### 4. Включить рантайм-флаг на полигоне
```bash
ssh tz "sudo -u postgres psql -d mykomanda -c \"
UPDATE vacancies SET funnel_runtime_enabled=true WHERE id='5ae8f734-b468-46fc-88f9-69ed662879ed'\""
```

### 5. Проверка после включения
- Песочница чат-бота (должен отвечать как раньше — бот включён в config).
- Логи cron hh-import / scan-incoming — без новых ошибок.
- При любой аномалии — мгновенный откат: `UPDATE ... SET funnel_runtime_enabled=false` (см. ниже).

## ЗАКРЫТО в этой сессии (было хвостом)
- `recovery` и `call_intent` теперь зеркалятся dual-write'ом (recovery → recoveryMessageEnabled,
  call_intent → descriptionJson.automation.callIntent.enabled). Гейт `recovery` в
  process-queue также обёрнут адаптером. Итого через адаптер: 6 гейтов / 5 блоков
  (ai_chatbot×2, stop_factors_resume, stop_words_chat, auto_reply_test_task, recovery).

## ИЗВЕСТНЫЕ ХВОСТЫ (не блокеры Phase 3)
- `test_quiz` не зеркалится — состояние теста живёт в таблице demos (kind='test'),
  простого boolean-флага на вакансии нет. Гейта в рантайме у него тоже нет.
- `call_intent` зеркалится в legacy, но его рантайм-гейт (scan-incoming, чтение
  descriptionJson.automation.callIntent) НЕ обёрнут адаптером — читает legacy напрямую.
  Через dual-write legacy синхронен с Builder, поэтому ок; обернуть при необходимости.
- Порядок блоков (funnelConfigJson.order) рантайм пока НЕ использует — последовательность
  этапов задаётся потоком кода. Перенос порядка под Builder — отдельный, более рискованный
  шаг (Phase 3.5+).

## ОТКАТ (мгновенный, без редеплоя)
```bash
ssh tz "sudo -u postgres psql -d mykomanda -c \"
UPDATE vacancies SET funnel_runtime_enabled=false WHERE id='5ae8f734-b468-46fc-88f9-69ed662879ed'\""
```
Флаг false → рантайм снова читает legacy. Код адаптера на остальных 18 вакансиях
не активен по определению (флаг default false).
