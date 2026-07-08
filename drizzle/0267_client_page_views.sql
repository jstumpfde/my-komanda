-- Аналитика просмотров клиентских страниц витрины (newsite.company24.pro/<slug>).
-- Юрий 08.07: по отправленной клиенту ссылке видеть кто/когда открыл, какие
-- страницы смотрел, докуда долистал и сколько времени провёл — объективная
-- обратная связь вместо «посмотрел и вроде понравилось».
--
-- Модель как в tip_share_views: накопительный upsert по одному визиту
-- (slug + path + visitor_id): seconds_visible и max_scroll_pct копятся по
-- коротким тикам heartbeat'а. visitor_id генерит сам клиент (localStorage),
-- recipient — метка из ?to=<имя> для персональных ссылок («кто именно»).
-- Аддитивная, идемпотентная миграция.
CREATE TABLE IF NOT EXISTS client_page_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,               -- какой сайт витрины
  path            text NOT NULL,               -- конкретная страница, напр. /biglife/ или /biglife/Big Life TV.dc.html
  visitor_id      text NOT NULL,               -- клиентский uuid из localStorage (устройство)
  recipient       text,                        -- метка ?to=<имя> — кому отправляли ссылку
  source          text,                        -- 'direct' | 'ref' | host реферера
  referrer        text,
  user_agent      text,
  screen          text,                        -- '1440x900'
  ip_hash         text,                        -- sha256(ip + NEXTAUTH_SECRET), не сам IP
  seconds_visible integer NOT NULL DEFAULT 0,  -- накопленное время видимости (cap 3600)
  max_scroll_pct  integer NOT NULL DEFAULT 0,  -- максимальная глубина прокрутки 0..100
  first_at        timestamptz NOT NULL DEFAULT now(),
  last_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_page_views_uq UNIQUE (slug, path, visitor_id)
);

CREATE INDEX IF NOT EXISTS client_page_views_slug_idx ON client_page_views (slug);
CREATE INDEX IF NOT EXISTS client_page_views_slug_visitor_idx ON client_page_views (slug, visitor_id);
CREATE INDEX IF NOT EXISTS client_page_views_last_idx ON client_page_views (last_at);
