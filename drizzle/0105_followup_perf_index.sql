-- Partial индекс для cron /api/cron/follow-up.
--
-- Запрос:
--   SELECT * FROM follow_up_messages
--   WHERE status='pending' AND scheduled_at <= now()
--   ORDER BY ... LIMIT 200;  -- сортировки в коде нет, но ORDER BY возможен в будущем
--
-- Существующие индексы:
--   - idx_followup_messages_scheduled_status (scheduled_at, status)
--     planner игнорирует на текущих данных (Seq Scan 0.25ms на 4511 pending
--     дешевле для LIMIT 200 — но это меняется с ростом таблицы).
--   - idx_follow_up_messages_pending_branch (candidate_id, branch, status)
--     WHERE status='pending' — partial, но по candidate_id, не по дате.
--
-- Этот индекс — partial по status='pending' с ключом по scheduled_at.
-- Размер ≈ rows(pending) * 16 байт; план запроса = «прочитать первые
-- N entries в индексе» + heap lookup, без полного скана таблицы.
-- При росте до миллионов записей seq scan деградирует, этот индекс — нет.
--
-- CONCURRENTLY: не блокирует таблицу при создании на проде.
-- IF NOT EXISTS: повторное применение миграции безопасно.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followup_messages_pending_scheduled
  ON follow_up_messages (scheduled_at)
  WHERE status = 'pending';
