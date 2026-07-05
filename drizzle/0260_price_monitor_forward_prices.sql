-- Мониторинг цен: «Цены вперёд» — помесячный семпл гостевой цены нашего
-- объекта на 6 месяцев вперёд (сезонность: куда площадка двигает цену на
-- высокий сезон, где даты закрыты). competitor_id NULL = наш объект (задел
-- на будущее сравнение сезонности с конкурентами). Идемпотентно.
CREATE TABLE IF NOT EXISTS price_monitor_forward_prices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id         uuid NOT NULL REFERENCES price_monitor_objects(id) ON DELETE CASCADE,
  competitor_id     uuid REFERENCES price_monitor_competitors(id) ON DELETE CASCADE,
  checkin_date      date NOT NULL,
  nights            integer NOT NULL,
  price_total       numeric,
  price_per_night   numeric,
  currency          text NOT NULL DEFAULT 'RUB',
  available         boolean NOT NULL DEFAULT false,
  captured_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_monitor_forward_prices_object_captured_idx ON price_monitor_forward_prices(object_id, captured_at DESC);
