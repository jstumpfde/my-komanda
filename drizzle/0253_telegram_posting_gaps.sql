-- Автоматический пересинк списка чатов (не только по кнопке "Обновить список").
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS chats_last_synced_at timestamptz;
