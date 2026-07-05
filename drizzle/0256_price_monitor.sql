-- Мониторинг цен (price_monitor): сравнение цен наших объектов размещения
-- с конкурентами поблизости. Первый источник — Airbnb; архитектура адаптеров
-- (lib/price-monitor/sources/<source>.ts) рассчитана на добавление
-- Суточно/Авито/Островок без переделки ядра. См. docs/architecture/PRICE-MONITOR-2026-07.md.

-- Наши объекты размещения, за которыми следим.
CREATE TABLE IF NOT EXISTS price_monitor_objects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  source           text NOT NULL DEFAULT 'airbnb',
  external_id      text NOT NULL,
  url              text,
  lat              double precision,
  lng              double precision,
  address          text,
  complex_name     text,
  is_active        boolean NOT NULL DEFAULT true,
  settings_json    jsonb NOT NULL DEFAULT '{}',
  last_checked_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_monitor_objects_company_idx ON price_monitor_objects(company_id);
CREATE INDEX IF NOT EXISTS price_monitor_objects_active_idx ON price_monitor_objects(is_active);

-- Конкуренты рядом с объектом — найдены автоматически (радиус+ЖК-фильтр)
-- или добавлены вручную.
CREATE TABLE IF NOT EXISTS price_monitor_competitors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id      uuid NOT NULL REFERENCES price_monitor_objects(id) ON DELETE CASCADE,
  source         text NOT NULL DEFAULT 'airbnb',
  external_id    text NOT NULL,
  url            text,
  name           text,
  lat            double precision,
  lng            double precision,
  distance_m     integer,
  complex_name   text,
  discovered     text NOT NULL DEFAULT 'auto', -- 'auto' | 'manual'
  is_ignored     boolean NOT NULL DEFAULT false,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, source, external_id)
);
CREATE INDEX IF NOT EXISTS price_monitor_competitors_object_idx ON price_monitor_competitors(object_id);

-- Срезы цен — нашего объекта (competitor_id = NULL) и конкурентов, по
-- периодам проживания (7/14/28/30 ночей и т.д., настраивается).
CREATE TABLE IF NOT EXISTS price_monitor_snapshots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id        uuid NOT NULL REFERENCES price_monitor_objects(id) ON DELETE CASCADE,
  competitor_id    uuid REFERENCES price_monitor_competitors(id) ON DELETE CASCADE,
  period_nights    integer NOT NULL,
  checkin_date     date NOT NULL,
  checkout_date    date NOT NULL,
  price_total      numeric,
  price_per_night  numeric,
  currency         text NOT NULL DEFAULT 'RUB',
  available        boolean NOT NULL DEFAULT true,
  raw_json         jsonb,
  captured_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_monitor_snapshots_object_captured_idx ON price_monitor_snapshots(object_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS price_monitor_snapshots_competitor_captured_idx ON price_monitor_snapshots(competitor_id, captured_at DESC);

-- Company-level дефолты мониторинга — эффективные настройки объекта = эти
-- значения, переопределённые непустыми полями settings_json объекта.
CREATE TABLE IF NOT EXISTS price_monitor_settings (
  company_id        uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  radius_m          integer NOT NULL DEFAULT 1000,
  periods           integer[] NOT NULL DEFAULT '{7,14,28,30}',
  interval_minutes  integer NOT NULL DEFAULT 1440,
  run_at_time       text NOT NULL DEFAULT '06:00',
  currency          text NOT NULL DEFAULT 'RUB',
  updated_at        timestamptz NOT NULL DEFAULT now()
);
