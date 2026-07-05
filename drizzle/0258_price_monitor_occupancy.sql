-- Мониторинг цен: заполняемость (occupancy) наших объектов из календаря
-- Airbnb — «загружены ли мы» на ближайшие 30/90 дней. Занятый день в
-- календаре = бронь ИЛИ ручной блок хозяина (сайдкар их не различает), поэтому
-- это ОЦЕНКА заполняемости, не факт брони. competitor_id сейчас всегда NULL
-- (наш объект) — задел на будущее сравнение с рынком. Идемпотентно.
CREATE TABLE IF NOT EXISTS price_monitor_occupancy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id       uuid NOT NULL REFERENCES price_monitor_objects(id) ON DELETE CASCADE,
  competitor_id   uuid REFERENCES price_monitor_competitors(id) ON DELETE CASCADE,
  horizon_days    integer NOT NULL, -- 30 | 90
  occupied_days   integer NOT NULL,
  total_days      integer NOT NULL,
  occupancy_pct   numeric NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_monitor_occupancy_object_captured_idx ON price_monitor_occupancy(object_id, captured_at DESC);
