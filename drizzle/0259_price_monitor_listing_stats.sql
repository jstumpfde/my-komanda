-- Мониторинг цен: срез характеристик листинга (привлекательность) — фото,
-- рейтинги по осям, отзывы, суперхост, гость-фаворит, tier, удобства. Дорогой
-- вызов сайдкара (/details) — берём только наш объект + топ-N ближайших
-- НЕ игнорируемых конкурентов, не всех подряд. competitor_id NULL = наш объект.
-- Идемпотентно.
CREATE TABLE IF NOT EXISTS price_monitor_listing_stats (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id           uuid NOT NULL REFERENCES price_monitor_objects(id) ON DELETE CASCADE,
  competitor_id       uuid REFERENCES price_monitor_competitors(id) ON DELETE CASCADE,
  photos_count        integer,
  rating_overall      numeric,
  rating_cleanliness  numeric,
  rating_location     numeric,
  rating_value        numeric,
  review_count        integer,
  is_super_host       boolean,
  is_guest_favorite   boolean,
  home_tier           integer,
  amenities_count     integer,
  captured_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_monitor_listing_stats_object_captured_idx ON price_monitor_listing_stats(object_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS price_monitor_listing_stats_competitor_captured_idx ON price_monitor_listing_stats(competitor_id, captured_at DESC);
