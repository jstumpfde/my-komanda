-- Telegram-постинг: личный userbot-аккаунт владельца платформы (MTProto/GramJS)
-- для постинга отложенных сообщений в Telegram-чаты/каналы (job-борды и
-- маркетинг). session_string хранится зашифрованным (AES-256-GCM,
-- lib/telegram-posting/crypto.ts, ключ в env TELEGRAM_SESSION_KEY).

CREATE TABLE IF NOT EXISTS telegram_userbot_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone              text,
  session_string     text,
  phone_code_hash    text,
  status             text NOT NULL DEFAULT 'pending_code',
  last_error         text,
  daily_limit        integer NOT NULL DEFAULT 20,
  last_connected_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_userbot_sessions_user_id_uq ON telegram_userbot_sessions(user_id);

-- Реестр диалогов Telegram (группы/каналы/личка), синкается из аккаунта владельца.
CREATE TABLE IF NOT EXISTS telegram_posting_chats (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tg_peer_id   text NOT NULL,
  access_hash  text,
  title        text NOT NULL,
  type         text NOT NULL,
  category     text,
  is_enabled   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_posting_chats_user_peer_uq ON telegram_posting_chats(user_id, tg_peer_id);

-- Отложенные посты — очередь сообщений в Telegram с расписанием и повтором.
CREATE TABLE IF NOT EXISTS telegram_scheduled_posts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL,
  image_path    text,
  chat_ids      jsonb NOT NULL,
  scheduled_at  timestamptz NOT NULL,
  repeat_rule   text NOT NULL DEFAULT 'none',
  status        text NOT NULL DEFAULT 'scheduled',
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_scheduled_posts_user_status_idx ON telegram_scheduled_posts(user_id, status);
CREATE INDEX IF NOT EXISTS telegram_scheduled_posts_scheduled_at_idx ON telegram_scheduled_posts(scheduled_at);

-- Лог доставок — одна строка на попытку отправки поста в конкретный чат.
CREATE TABLE IF NOT EXISTS telegram_post_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid NOT NULL REFERENCES telegram_scheduled_posts(id) ON DELETE CASCADE,
  chat_id       uuid NOT NULL REFERENCES telegram_posting_chats(id) ON DELETE CASCADE,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL,
  error         text,
  tg_message_id text
);
CREATE INDEX IF NOT EXISTS telegram_post_deliveries_post_id_idx ON telegram_post_deliveries(post_id);
CREATE INDEX IF NOT EXISTS telegram_post_deliveries_chat_id_idx ON telegram_post_deliveries(chat_id);
