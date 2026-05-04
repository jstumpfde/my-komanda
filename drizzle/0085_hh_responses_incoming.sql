-- 0085_hh_responses_incoming.sql
-- Поля для слушателя входящих сообщений (cron /api/cron/hh-incoming-messages):
--   last_seen_message_id — ID последнего обработанного applicant-сообщения
--   last_check_at         — момент последней проверки сообщений этого отклика
--
-- Cron каждые 15 минут берёт до 100 откликов с status IN ('invited','response')
-- и last_check_at < NOW()-14min OR NULL, FIFO по last_check_at NULLS FIRST.

ALTER TABLE hh_responses
  ADD COLUMN IF NOT EXISTS last_seen_message_id TEXT,
  ADD COLUMN IF NOT EXISTS last_check_at        TIMESTAMP;

-- Индекс для FIFO-выборки cron'ом. Ограничиваем условием по статусу,
-- чтобы не индексировать терминальные/архивные записи.
CREATE INDEX IF NOT EXISTS idx_hh_responses_incoming_due
  ON hh_responses (last_check_at NULLS FIRST)
  WHERE status IN ('invited', 'response');
