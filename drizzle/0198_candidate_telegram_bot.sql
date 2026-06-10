-- 0198_candidate_telegram_bot.sql
-- F7: Telegram-бот для переписки с кандидатами.
-- Аддитивные колонки, идемпотентно. Существующее поведение не меняется.

-- companies: username и webhook-секрет для кандидатского бота
ALTER TABLE companies ADD COLUMN IF NOT EXISTS candidate_bot_username       text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS candidate_bot_webhook_secret text;

-- candidates: токен-приглашение (deep-link), opt-out флаг, история TG-сообщений
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS telegram_invite_token text;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS telegram_opt_out       boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS tg_messages            jsonb   NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS candidates_telegram_invite_token_idx
  ON candidates (telegram_invite_token) WHERE telegram_invite_token IS NOT NULL;
