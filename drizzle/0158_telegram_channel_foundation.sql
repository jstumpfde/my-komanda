-- 0158_telegram_channel_foundation.sql
-- Фундамент данных для будущего Telegram-канала чат-бота с кандидатами.
-- Только аддитивные колонки/индекс, идемпотентно. Существующее поведение не меняется
-- (ai_chatbot_messages.channel получает default 'hh', поэтому текущий код работает как раньше).

-- candidates: связка с Telegram-чатом кандидата
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS telegram_chat_id text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS telegram_username text;

CREATE INDEX IF NOT EXISTS candidates_telegram_chat_id_idx
  ON candidates (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

-- companies: токен бота-кандидата (per-company Telegram bot)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS candidate_bot_token text;

-- ai_chatbot_messages: канал сообщения ('hh' | 'telegram'); default 'hh' для обратной совместимости
ALTER TABLE ai_chatbot_messages ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'hh';
