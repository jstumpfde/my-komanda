# DEBUG — дожим не доходит / не производится «по расписанию» (01.06.2026)

Расследование (статический разбор кода; прод из песочницы недоступен — нужны
SQL-прогоны на сервере). **Явного бага в коде НЕ найдено** — пайплайн рабочий,
причина почти наверняка в конфиге/состоянии. Ниже — как устроено, ранжированные
гипотезы и точные SQL, чтобы за 2 минуты найти корень.

## Как работает дожим (2 этапа)

1. **Производство цепочки** — `lib/hh/process-queue.ts:921-997`, при импорте
   hh-отклика. Условия, без которых цепочка НЕ создаётся:
   - есть `follow_up_campaigns` для вакансии с `enabled = true`;
   - `campaign.preset` валиден и `!= 'off'`;
   - у кандидата ещё нет pending/sent касаний в этой кампании (дедуп).
   Тексты/дни: `customMessages` + `descriptionJson.followupCustomDays`,
   расписание слотов — `generateTouchSchedule` → `adjustToWorkingWindow`
   (сдвигает в рабочее окно вакансии).
   ⚠️ Цепочка ставится ТОЛЬКО в момент импорта отклика. Кандидаты,
   импортированные ДО включения кампании, цепочку не получат задним числом.

2. **Отправка касаний** — cron `POST /api/cron/follow-up`
   (`app/api/cron/follow-up/route.ts`), раз в минуту (crontab). Берёт pending
   с `scheduled_at <= now()` и шлёт в hh-чат. Ключевые отмены/пропуски:
   - **`ai_chatbot_active`** (стр. 296): если `vacancies.ai_chatbot_enabled =
     true` — ВСЕ касания дожима отменяются (чат-бот ведёт диалог сам). ← самый
     вероятный кандидат, если на вакансии включён AI-бот.
   - **off_hours / non_working_day / holiday** (`canSendNow`, стр. 308): вне
     окна вакансии касание остаётся pending (следующий cron в рабочее время
     подберёт). Если расписание задано «узко»/не та TZ/сегодня нерабочий —
     висит pending и «не доходит».
   - **rate_limit_one_per_day**: не более 1 отправленного дожима в день
     кандидату.
   - **no_hh_response_link / no_hh_token** → failed.
   - **duplicate_text** → cancelled (тот же текст уже уходил).

## Ранжированные гипотезы

| # | Причина | Признак в данных |
|---|---------|------------------|
| A | На вакансии включён **AI-чат-бот** → дожим отменяется | followUpMessages.error_message = `ai_chatbot_active` |
| B | Кампания **выключена** или `preset='off'` → цепочки не производятся | followUpCampaigns.enabled=false / preset='off' |
| C | Кандидаты импортированы **до** включения кампании → цепочки нет | нет строк followUpMessages у старых кандидатов |
| D | **Расписание** вакансии режет окно (TZ/часы/дни) → всё pending | много pending; cron reasons = off_hours/non_working_day |
| E | **cron не идёт** (crontab/секрет) | в cron_runs нет свежих прогонов follow-up; /var/log пуст |
| F | Нет hh-связки / токен истёк | error_message = no_hh_response_link / no_hh_token / hh_4xx |

## SQL для диагностики (на сервере)

Вакансия РОП Орлинк: `58ba1d88-73b4-4f1e-b2f0-959e47bf6c60`.

```bash
sudo -u postgres psql -d mykomanda
```

```sql
-- 1) Включён ли AI-бот и какое расписание у вакансии (гипотезы A, D)
SELECT id, title, ai_chatbot_enabled,
       schedule_enabled, schedule_start, schedule_end, schedule_timezone,
       schedule_working_days
FROM vacancies WHERE id = '58ba1d88-73b4-4f1e-b2f0-959e47bf6c60';

-- 2) Кампания дожима: включена? какой пресет? (гипотезы B)
SELECT id, enabled, preset, custom_messages IS NOT NULL AS has_custom
FROM follow_up_campaigns WHERE vacancy_id = '58ba1d88-73b4-4f1e-b2f0-959e47bf6c60';

-- 3) Что с касаниями: разбивка по статусу и причине (гипотезы A, D, F)
SELECT fm.status, fm.error_message, count(*)
FROM follow_up_messages fm
JOIN follow_up_campaigns fc ON fc.id = fm.campaign_id
WHERE fc.vacancy_id = '58ba1d88-73b4-4f1e-b2f0-959e47bf6c60'
GROUP BY 1,2 ORDER BY 3 DESC;

-- 4) Сколько pending и когда они запланированы (гипотеза D — всё в будущем/вне окна)
SELECT min(scheduled_at), max(scheduled_at), count(*)
FROM follow_up_messages fm
JOIN follow_up_campaigns fc ON fc.id = fm.campaign_id
WHERE fc.vacancy_id = '58ba1d88-73b4-4f1e-b2f0-959e47bf6c60'
  AND fm.status = 'pending';

-- 5) Идёт ли cron follow-up вообще (гипотеза E) — если есть таблица cron_runs
SELECT * FROM cron_runs WHERE job ILIKE '%follow%' ORDER BY started_at DESC LIMIT 5;
```

Лог cron на сервере (если настроен): `tail -n 50 /var/log/*follow*` или
`pm2 logs my-komanda --lines 200 | grep follow-up` — строки вида
`{"tag":"cron/follow-up", ... "reasons": {...}}` сразу покажут, почему касания
cancelled/skipped.

## Что делать по результату

- **reasons = `ai_chatbot_active`** → дожим намеренно отключён, пока на вакансии
  включён AI-бот. Решение: либо выключить AI-бота, либо принять, что бот заменяет
  дожим. (Отдельная тест-воронка дожима — пункт T в очереди — это учтёт.)
- **campaign.enabled=false / preset='off'** → включить кампанию/выбрать пресет в
  UI дожима вакансии.
- **гипотеза C (старые кандидаты)** → цепочка ставится только при импорте; для
  уже импортированных нужен «прогон/перепланирование» (если в UI есть кнопка) или
  ручной backfill.
- **off_hours/non_working_day** → проверить schedule_* у вакансии (TZ, часы, дни).
- **cron не идёт** → проверить crontab и `CRON_SECRET` (он, кстати, светился в
  чате — в очереди стоит ротация, см. HANDOFF §4).

## Вывод
Код дожима исправен; «не доходит/не производится» — это конфиг/состояние.
Самый вероятный корень — **включённый AI-чат-бот на вакансии** (cron отменяет
все касания с `ai_chatbot_active`) ИЛИ **выключенная кампания/preset='off'**.
SQL #1–#3 выше дают ответ за минуту.
