-- Атрибуция источников Telegram-постинга: трекинг-ссылки в постах +
-- авто-атрибуция входящих ЛС через userbot + сводка по каналам с расходами.

-- Уникальные трекинг-ссылки на чат в рамках поста (code — 8 симв. base62,
-- см. lib/telegram-posting/link-code.ts). Редирект /go/{code} инкрементит clicks.
CREATE TABLE IF NOT EXISTS telegram_post_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES telegram_scheduled_posts(id) ON DELETE CASCADE,
  chat_id     uuid NOT NULL REFERENCES telegram_posting_chats(id) ON DELETE CASCADE,
  code        text NOT NULL,
  target_url  text NOT NULL,
  clicks      integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_post_links_code_uq ON telegram_post_links(code);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_post_links_post_chat_uq ON telegram_post_links(post_id, chat_id);

-- Лог кликов по трекинг-ссылкам. Сырой IP НЕ храним — только sha256(ip+соль).
CREATE TABLE IF NOT EXISTS telegram_link_clicks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id     uuid NOT NULL REFERENCES telegram_post_links(id) ON DELETE CASCADE,
  clicked_at  timestamptz NOT NULL DEFAULT now(),
  user_agent  text,
  ip_hash     text
);
CREATE INDEX IF NOT EXISTS telegram_link_clicks_link_id_idx ON telegram_link_clicks(link_id);

-- Лиды из входящих ЛС (userbot видит, что кому-то написали в личку из чата/поста).
-- Атрибуция: common_chat (общий чат с постом) / timing (по времени последней
-- доставки) / manual (HR/владелец указал вручную).
CREATE TABLE IF NOT EXISTS telegram_dm_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tg_user_id           text NOT NULL,
  tg_username          text,
  display_name         text,
  first_message_at     timestamptz NOT NULL,
  first_message_text   text,
  source_chat_id       uuid REFERENCES telegram_posting_chats(id) ON DELETE SET NULL,
  source_confidence    text,                 -- 'common_chat' | 'timing' | 'manual'
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_dm_leads_user_tg_uq ON telegram_dm_leads(user_id, tg_user_id);

-- Стоимость размещения (₽/пост) для платных каналов — используется в аналитике.
ALTER TABLE telegram_posting_chats ADD COLUMN IF NOT EXISTS cost_per_post numeric(10,2);

-- Куда вести трекинг-ссылку поста (если задано — sender.ts подставит /go/{code}).
ALTER TABLE telegram_scheduled_posts ADD COLUMN IF NOT EXISTS link_url text;

-- Разнесение отправки по чатам во времени (мин.), 0 = все чаты сразу (как раньше).
-- В некоторых чатах внешние ссылки запрещены — разнос по времени делает
-- тайминг-атрибуцию входящих ЛС надёжнее (без трекинг-ссылки в тексте).
-- Ограничение 480 (8ч) — иначе ломает DELIVERY_WINDOW_MS (12ч) в sender.ts.
ALTER TABLE telegram_scheduled_posts ADD COLUMN IF NOT EXISTS stagger_minutes integer NOT NULL DEFAULT 0;

-- Настройки авто-атрибуции ЛС через userbot.
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS dm_watch_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE telegram_userbot_sessions ADD COLUMN IF NOT EXISTS dm_last_checked_at timestamptz;
