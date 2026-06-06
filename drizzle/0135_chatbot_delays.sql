-- Группа 33: AI чат-бот — настраиваемые задержки + двойные сообщения.
-- Счётчик отправленных «коротких» сообщений ("Минутку, посмотрю...") на
-- кандидата, чтобы не спамить ими в одном диалоге.
--
-- DEFAULT 0 безопасно для существующих кандидатов.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS short_messages_sent_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_short_message_at timestamptz;
