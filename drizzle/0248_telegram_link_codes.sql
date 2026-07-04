-- Аудит 04.07: одноразовый код привязки Telegram-бота базы знаний к пользователю
-- платформы вместо привязки по голому email (закрытие account-takeover).
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code        text NOT NULL UNIQUE,
  expires_at  timestamp NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_link_codes_user_id_idx ON telegram_link_codes(user_id);
