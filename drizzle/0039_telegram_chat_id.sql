-- Telegram bot account linking: maps a Telegram chat_id to a user row.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" text;

CREATE INDEX IF NOT EXISTS "users_telegram_chat_id_idx" ON "users" ("telegram_chat_id");
