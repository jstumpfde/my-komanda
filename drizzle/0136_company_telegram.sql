-- Группа 34, задача 3: per-company Telegram-канал HR.
-- Один канал на компанию для уведомлений (новые отклики, AI-эскалации,
-- важные события). НЕ затрагивает главный канал Юрия @Company24AgentsBot —
-- тот служит для платформенного мониторинга и остаётся как есть.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_bot_token text;
