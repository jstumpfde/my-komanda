-- P0-53: документируем новое допустимое значение hh_responses.status='orphaned'
--
-- Колонка hh_responses.status — это text без CHECK-constraint'а на уровне БД
-- (см. lib/db/schema.ts:1549 — text("status").notNull().default("new")).
-- Поэтому ALTER TABLE не нужен — новое значение принимается как есть.
--
-- Допустимые значения после этой миграции:
--   'new'                — отклик импортирован, ещё не разобран (legacy)
--   'response'           — hh API state.id — отклик в очереди разбора
--   'invited'            — приглашение отправлено, кандидат в воронке
--   'orphaned'           — P0-53: linked candidate в стадии rejected/hired
--                          или с auto_processing_stopped=true.
--                          processHhQueue такие отклики не разбирает.
--
-- Чистка инициируется /api/cron/hh-cleanup-stuck (или из /api/cron/hh-import
-- в начале каждого прогона).

-- Опциональный partial index — ускоряет cleanup-запрос если orphaned-отклики
-- будут редкими (а они должны быть редкими).
CREATE INDEX IF NOT EXISTS idx_hh_responses_status_response
  ON hh_responses (status)
  WHERE status = 'response';
