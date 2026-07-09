-- Платформенный Telegram-бот напоминаний менеджеру об интервью (@Ren_HR_bot).
-- Аддитивная миграция — не трогает существующие данные.

ALTER TABLE telegram_link_codes ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'knowledge_base';

ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_reminder_chat_id text;

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS remind_manager_24h_sent_at timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS remind_manager_morning_sent_at timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS remind_manager_1h_sent_at timestamptz;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS remind_manager_15m_sent_at timestamptz;
