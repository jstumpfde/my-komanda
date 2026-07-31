-- Привязка пользователя платформы к личному чату двустороннего Telegram-бота
-- @TiketCompany24bot (Бизнес-ассистент → Авиабилеты). Один активный chatId на
-- пользователя; linkToken — одноразовая ссылка t.me/TiketCompany24bot?start=<token>.
CREATE TABLE IF NOT EXISTS user_telegram_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chat_id     text,
  link_token  text NOT NULL,
  linked_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_telegram_links_user_idx ON user_telegram_links (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_telegram_links_chat_id_idx ON user_telegram_links (chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_telegram_links_token_idx ON user_telegram_links (link_token);
