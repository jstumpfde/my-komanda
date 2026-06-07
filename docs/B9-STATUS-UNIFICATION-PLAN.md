# B9 — план унификации статусов кандидата (анализ 08.06.2026)

> Только план, код НЕ менялся. B9 = крупный техдолг, делать через стейджинг с dual-read.

## Проблема
У `candidates` параллельно живут ДВЕ системы состояния:
1. **`stage`** — бизнес-воронка (new → primary_contact → demo_opened → anketa_filled → … → hired/rejected). Это то, что видит HR.
2. **Флаги обработки** — `automationPaused`, `autoProcessingStopped`(+Reason/At), `prequalificationStatus`(+SentAt/CompletedAt), `pendingRejectionAt`(+Reason/SetAt/Message), счётчики `callIntentCount`/`abuseWarningsCount`.

Они не гарантированно синхронны → противоречия и риск рас-синхрона.

## Конкретные точки конфликта
- `applyWantsContact` (lib/hh/scan-incoming.ts ~226): `stage=primary_contact` + `automationPaused=true` — HR видит «ждёт контакта», но дожим стоит, а stuck-фильтр в process-queue его не видит.
- `process-queue` создаёт кандидата `stage=primary_contact`, но мог выставить `pendingRejectionAt` → cron отклонит через N часов, хотя в UI он «в работе».
- Prequalification: `stage=new` + `prequalificationStatus=pending` — стадия не отражает, что идёт опрос.
- Дублирование чтения: `process-queue` stuck-фильтр смотрит И `stage IN (rejected,hired)` И `autoProcessingStopped=true`; `should-stop` смотрит И флаги И stage.

## Где выставляется/читается (ключевое)
- Выставление stage: lib/hh/process-queue.ts (~289/410/447), lib/hh/scan-incoming.ts (applyRejection ~189, applyWantsContact ~227), lib/rejection/execute.ts (~108), app/api/modules/hr/candidates/[id]/stage, lib/prequalification/finalize.ts.
- Флаги: scan-incoming.ts (~188-191, 226-230), rejection/execute.ts (~107-112).
- Чтение для решений: process-queue.ts (~116-117 stuck-фильтр), followup/should-stop.ts (~46 стоп дожима), pending-rejections cron (~50-52).

## План (поэтапно, dual-read, через стейджинг)
1. **Аудит (низкий риск):** sanity-check cron, который ищет противоречия (stage=primary_contact且pendingRejectionAt; prequalStatus=pending且stage∉{new,primary_contact}) и логирует. Только SELECT. + документировать семантику в schema.ts/stages.ts.
2. **Консолидация rejection (средний):** источник правды = `stage`. `executeRejection`/`applyRejection` оставляют `stage=rejected` (+ Reason для аудита), перестают плодить `automationPaused`/`autoProcessingStopped`. Чтения переводим на `stage=rejected OR pendingRejectionAt IS NOT NULL`. Dual-read 2 недели (старые флаги OR новое условие).
3. **Prequalification как стадия (средний):** ввести стадию `prequalification`; start→stage=prequalification, finalize→следующая стадия по вердикту; `prequalificationStatus` депрекейтнуть (вычисляется из stage). Обновить фильтры/сортировки/UI на новую стадию.
4. **Счётчики (низкий):** переименовать понятнее (callIntentCount→insistDemoAttempts, abuseWarningsCount→securityWarningsLevel), задокументировать lifecycle, апдейтить в транзакции со stage.
5. **Cleanup (низкий):** после 3 недель без противоречий — удалить deprecated-колонки, убрать legacy-fallback.

## Безопасный ПЕРВЫЙ шаг (можно начать без риска)
- sanity-check cron (только чтение) → увидеть реальный размер проблемы на проде.
- В `lib/followup/should-stop.ts` перейти на dual-read (`stage=rejected OR pendingRejectionAt` ИЛИ старые флаги) — более консервативно, не ломает.
- Тесты на переходы состояния (executeRejection синхронно ставит всё нужное).

## Риски
- Новая стадия `prequalification` должна попасть во ВСЕ фильтры/сортировки/канбан/UI, иначе кандидаты «пропадут» из колонок.
- Race между cron-ами (pending-rejections vs process-queue) — делать обновления состояния атомарно/с version-check.
- Не делать «большой взрыв» — только dual-read поэтапно, проверяя sanity-cron между шагами.
