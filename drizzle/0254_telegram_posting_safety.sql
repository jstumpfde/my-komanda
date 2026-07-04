-- Безопасность аккаунта: разгон лимита для свежеподключённого аккаунта,
-- реакция на PEER_FLOOD (серьёзный сигнал от Telegram — слишком активная
-- рассылка новым адресатам), ручная аварийная пауза владельцем.
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS first_activated_at timestamptz;
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS peer_flood_until timestamptz;
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS sending_paused boolean NOT NULL DEFAULT false;
