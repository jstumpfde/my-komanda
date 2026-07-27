-- Бизнес-ассистент → Авиабилеты → «Отслеживать цену»: опциональное
-- Telegram-уведомление в личный чат владельца watch'а (в дополнение к
-- колокольчику notifications). chat_id — видимое редактируемое поле,
-- НЕ хардкод: пользователь берёт его сам, написав /start боту компании.
ALTER TABLE flight_price_watches
  ADD COLUMN IF NOT EXISTS notify_telegram boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;
