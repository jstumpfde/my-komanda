# Сессия 1 — Фикс cron дожима + оптимизация + чистка

**Дата:** 2026-05-19
**Стартовая точка:** `before-followup-fix-2026-05-19` (коммит `94e94d3b`, состояние прода до сессии)
**Финальная точка прода:** `b774529` на `main`

---

## Что сделано

### Коммиты (8 шт, в хронологическом порядке)

| SHA | Тип | Описание |
| --- | --- | --- |
| `7866010` | refactor | Вынос `matchStopWord` + `STOP_WORDS` в `lib/followup/stop-words.ts` — единая точка истины для дожима и `scan-incoming.ts` |
| `6126e8b` | fix | Защита `should-stop.ts` от не-строковых `anketa_answers` (это и был корень TypeError в cron); расширена логика поиска стоп-слов: проходим все элементы массива, поддерживаем `string` и `array of strings`, остальные типы игнорируем; `.includes()` заменён на word-boundary regex |
| `995afc3` | perf | LIMIT 50→200, обработка батчами по 10 через `Promise.all`, пауза 100ms между батчами; новый outcome `"skipped"` для отсечённых расписанием; JSON-лог метрик в конце каждого тика |
| `2def952` | perf | Миграция `0105_followup_perf_index.sql` — partial индекс `(scheduled_at) WHERE status='pending'`; применён на проде и staging |
| `0bf40c4` | chore | Файл `logrotate-follow-up.conf` в корне репо |
| `17f87f7` | chore | Замена дефолтных текстов касаний (обе ветки А и Б) на нейтральный тон — без агрессивных продающих хуков, универсально для всех клиентов |
| `580aa9b` | merge | Подтягивание в `develop` 4 hotfix-коммитов из `main` от 15.05 (feat hh-auto-process, stage, status badge, drawer pipeline); разрешён конфликт в `app/api/modules/hr/vacancies/route.ts` — оставлен вызов `seedDefaultFunnelStages` (рефакторинг идентичного hotfix-SQL) |
| `b774529` | chore | Добавлен `su root root` в logrotate-конфиг (обнаружено при установке на проде: `/var/log` group-writable) |

### Финальные метрики прода

| Метрика | До | После |
| --- | --- | --- |
| HTTP cron `/api/cron/follow-up` | **500** (TypeError на каждом тике) | **200** |
| Латентность холостого тика | n/a | **3 ms** |
| Латентность тика на полном LIMIT (200 шт) | n/a (падал) | **6.1 s** на staging (≈ 30 ms/touch) |
| LIMIT за тик | 50 (последовательно) | 200 (батчи по 10 параллельно) |
| Метрики в логах | только stacktrace | структурированный JSON `{tag, processed, sent, cancelled, failed, skipped, durationMs, ts}` |
| Index на `(scheduled_at)` для pending | отсутствовал | `idx_followup_messages_pending_scheduled` (partial) |

### Состояние таблицы `follow_up_messages` на проде

| Статус | До чистки | После чистки |
| --- | --- | --- |
| `pending`   | 4 513 | **0** |
| `sent`      | 3     | 3 |
| `failed`    | 1     | 1 |
| `cancelled` | 3 890 | 8 403 |
| **Total**   | 8 407 | 8 407 |

Чистка через `UPDATE follow_up_messages SET status='cancelled', error_message='cleanup_pre_relaunch_2026_05_19' WHERE status='pending'` — `UPDATE 4513`. Никаких DELETE, все данные сохранены для аудита.

### Состояние staging

То же самое: pending=0, очередь полностью переведена в cancelled с тем же `error_message`. Cron возвращает 200 на холостом ходу за 3 ms.

---

## Изменённые файлы

| Файл | Строки | Тип изменения |
| --- | ---: | --- |
| `app/api/cron/follow-up/route.ts`       | +146 / −114 | оптимизация (батчи, JSON-лог, outcome enum) |
| `app/api/modules/hr/vacancies/route.ts` | +1 / −1     | merge resolution (вызов хелпера вместо inline SQL) |
| `drizzle/0105_followup_perf_index.sql`  | +25 (new)   | partial индекс |
| `lib/followup/default-messages.ts`      | +25 / −23   | замена текстов на нейтральные |
| `lib/followup/should-stop.ts`           | +44 / −8    | фикс TypeError + расширенная логика |
| `lib/followup/stop-words.ts`            | +35 (new)   | единая точка истины для STOP_WORDS + matchStopWord |
| `lib/hh/scan-incoming.ts`               | +1 / −23    | импорт matchStopWord из нового модуля, удаление дубля |
| `logrotate-follow-up.conf`              | +39 (new)   | logrotate-конфиг + `su root root` |
| `CLAUDE.md`                             | +36 / −0    | (косвенно: подтянуто из main через merge — docs-коммиты bba8cdd / 08b9a74) |

**Итого:** 345 строк добавлено / 176 удалено.

---

## EXPLAIN ANALYZE

Запрос cron'а:
```sql
SELECT * FROM follow_up_messages
WHERE status='pending' AND scheduled_at <= now()
LIMIT 200;
```

### ДО создания индекса (на проде, 4 511 pending / 8 379 total)

```
Limit  (cost=0.00..44.13 rows=200 width=300) (actual time=0.017..0.189 rows=200 loops=1)
  ->  Seq Scan on follow_up_messages  (cost=0.00..504.66 rows=2287 width=300)
        Filter: ((status = 'pending') AND (scheduled_at <= now()))
        Rows Removed by Filter: 392
Planning Time: 0.530 ms
Execution Time: 0.250 ms
```

### ПОСЛЕ создания индекса (тот же датасет, после ANALYZE)

```
Limit  (cost=0.00..44.26 rows=200 width=300) (actual time=0.009..0.122 rows=200 loops=1)
  ->  Seq Scan on follow_up_messages
        Filter: ((status = 'pending') AND (scheduled_at <= now()))
        Rows Removed by Filter: 392
Planning Time: 0.240 ms
Execution Time: 0.143 ms
```

### С `SET enable_seqscan=off` (проверка что индекс рабочий)

```
Limit  (cost=50.13..85.16 rows=200 width=300) (actual time=0.212..0.309 rows=200 loops=1)
  ->  Bitmap Heap Scan on follow_up_messages  (cost=50.13..453.44 rows=2303)
        Recheck Cond: ((scheduled_at <= now()) AND (status = 'pending'))
        Heap Blocks: exact=23
        ->  Bitmap Index Scan on idx_followup_messages_pending_scheduled
              Index Cond: (scheduled_at <= now())
Planning Time: 0.592 ms
Execution Time: 0.352 ms
```

### Почему планировщик не сменил план

На датасете «4 511 pending из 8 379» доля pending = **54%**. Для такой плотности Seq Scan с ранним LIMIT-shortcut дешевле любого индекса: при последовательном проходе heap планировщик находит первые 200 матчей в первых ≈23 блоках (см. `Heap Blocks: exact=23` в Bitmap Heap Scan).

После сегодняшней чистки доля pending = **0%**. Когда cron включится и накопит активные касания (например 50–200 pending), доля упадёт до ≈2–5% — и тогда планировщик сменит план на Bitmap Index Scan по `idx_followup_messages_pending_scheduled` автоматически. Индекс крошечный (partial по status='pending'), запись в него почти бесплатна, а с ростом таблицы он начнёт окупаться без ручного вмешательства.

---

## Что НЕ сделано в этой сессии (для Сессии 2)

1. **UI кастомных текстов в карточке вакансии:**
   - Textarea для каждого касания × две ветки (А «не открыл», Б «открыл, не дошёл»).
   - Кнопки «вернуть к дефолту» (передают `customMessages: null` / `customMessagesOpened: null`).
   - Подсказка-пояснение по плейсхолдерам `{Имя}`, `{должность}`, `{компания}`, `{ссылка}`.
2. **Фильтр `min_resume_score`** перед шедулом дожима:
   - Ползунок 0–100, default 40, в настройках вакансии.
   - Миграция БД на колонку `vacancies.min_resume_score`.
3. **PATCH `/api/modules/hr/vacancies/[id]/followup-settings`** принимает:
   - `customMessagesOpened` (валидация: массив, slice 0..20, элементы slice 0..2000) — сейчас принимается только `customMessages`.
   - `minResumeScore` (число 0–100).
4. **`lib/hh/process-queue.ts`** — фильтр кандидата по `resume_score < min_resume_score` ДО создания touches.
5. **Включение cron обратно:**
   - В `/etc/crontab` снять `# DISABLED` префикс с `*/15` строки, заменить на `*/5 * * * *`.
   - Проверить первый тик в лог-файле `/var/log/follow-up.log` (logrotate уже установлен).

---

## Известные открытые вопросы / TODO

1. **Объединение настроек дожима в один таб.** Сейчас фрагменты размазаны по 3 табам карточки вакансии: «Сообщения» (`VacancyFollowupSettings`), «Демо и воронка» (`AutomationSettings`, `PostDemoSettings`), «AI сценарии» (`VacancyScheduleSettings`). Кандидат на объединение — отдельная задача UI-рефакторинга.
2. **Активная отмена pending при ручном rejected.** Сейчас при переводе кандидата в `rejected` через `[id]/stage/route.ts` или bulk — pending-сообщения отменяются **лениво** (только на ближайшем cron-тике через `shouldStopFollowUp`). Если cron выключен или редкий, кандидат теоретически может получить очередное касание после ручного отказа. Решение: явный `UPDATE follow_up_messages SET status='cancelled', error_message='manual_rejection' WHERE candidate_id=? AND status='pending'` сразу при смене stage.
3. **Колонка `channel` в `follow_up_messages`** допускает `'email' | 'telegram'`, но реализован только `'hh'`. Либо удалять из схемы и enum'а, либо делать задел на эти каналы.
4. **Перенос cron-конфигурации в репо** (`scripts/cron/` или `infra/`). Сейчас единственный источник правды — `crontab -l` под root на 5.42.125.91; восстановить с нуля невозможно без ssh-доступа. Хотя бы держать дублирующий файл в репо и регулярно сверять.
5. **Поведение `scan-incoming.ts` после рефакторинга стоп-слов** — посмотреть в течение недели, нет ли регрессий по реальным входящим hh-сообщениям. Логика `matchStopWord` идентична прежней (буквальный copy-paste в новый файл), но всё равно стоит понаблюдать `pm2 logs my-komanda | grep "applyRejection\|stop_word_regex"`.
6. **Логический сдвиг охвата стоп-слов в `should-stop.ts`.** Раньше проверялся только последний элемент `anketa_answers` (и из-за неверного типа никогда не находил), теперь — все строковые `answer` и массивы строк. Это расширение, потенциально может cancellить кандидатов, которых раньше дожимали. Помониторить долю `cancelled with reason candidate_refused` в первую неделю после включения cron.
7. **Сегодняшний промежуточный казус с ручным curl до чистки.** При деплое прода я дёрнул cron руками ДО чистки очереди — попал в LIMIT 200 pending, `sent:0` (всех отсёк `canSendNow` по расписанию), но это могло сработать иначе в рабочее время. На будущее — в SOPе зафиксировать: «после `pm2 reload` НЕ дёргать cron до чистки очереди, если очередь не пуста».

---

## Точка отката

**Тег:** `before-followup-fix-2026-05-19` → коммит `94e94d3b` (состояние прода на старте сессии).

**Команда отката на прод** (если что-то пойдёт не так):
```bash
ssh root@5.42.125.91
cd /var/www/my-komanda
git fetch origin
git reset --hard before-followup-fix-2026-05-19
rm -rf .next
pnpm install --frozen-lockfile
pnpm build
pm2 reload my-komanda
```

Отдельно: индекс `idx_followup_messages_pending_scheduled` можно оставить как есть — даже после отката кода он не сломает старое поведение (старый код о нём не знает). Если хочется убрать: `DROP INDEX CONCURRENTLY idx_followup_messages_pending_scheduled;`.

---

## Снапшот crontab

**До изменений** (бэкап на сервере): `/tmp/crontab.bak` — содержит активную строку `*/15 * * * * curl ... follow-up`.

**Текущий crontab** (на сервере `5.42.125.91`):
```
0 3 * * * /usr/local/bin/backup-mykomanda.sh
* * * * * /usr/local/bin/sync-tz-to-inbox.sh
*/5 * * * * curl ... /api/cron/hh-import         >> /var/log/hh-import.log 2>&1
*/10 * * * * curl ... /api/cron/hh-incoming-messages >> /var/log/hh-incoming.log 2>&1
# DISABLED 2026-05-19 (session 1 deploy, will re-enable as */5 after queue cleanup): */15 * * * * curl ... /api/cron/follow-up >> /var/log/follow-up.log 2>&1
```

Cron дожима **закомментирован**. Будет реактивирован в Сессии 2 после установки UI кастомных текстов на стороне клиента, с частотой `*/5` (вместо прежней `*/15`).

---

## Сводка по этапам сессии

| Этап | Статус | Что сделано |
| --- | --- | --- |
| A — Диагностика | ✅ | Найдено точное место падения (`should-stop.ts:79`), подтверждено через psql на проде что top-level `anketa_answers` — массив или объект, а `answer` внутри — почти всегда `{viewed:true}` |
| B — Фикс TypeError | ✅ | Защита от не-строковых типов + расширенная логика + word-boundary regex |
| C — Оптимизация cron | ✅ | LIMIT 200, батчи, JSON-лог |
| D — Индексы | ✅ | Partial индекс, EXPLAIN до/после зафиксирован в commit |
| E — Logrotate | ✅ | Конфиг создан, установлен на проде, dry-run чистый |
| F — Staging | ✅ | HTTP 200, JSON-лог корректный, durationMs 6s на 200 шт |
| G — Чистка staging | ✅ | UPDATE 4080 → pending=0, контрольный тик 3ms |
| H — Прод | ✅ | Через `Вариант 1` merge: подтянули 4 hotfix из main в develop, fast-forward в main, деплой на прод, чистка `UPDATE 4513`, HTTP 200 |
| I — Cron частота | ⏸ | Пропущен по решению Юрия — cron остаётся выключенным до Сессии 2 |
| J — Отчёт | ✅ | Этот документ |
