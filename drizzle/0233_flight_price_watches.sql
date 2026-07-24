-- Бизнес-ассистент → Авиабилеты → «Отслеживать цену»: сохранённые поиски,
-- которые крон /api/cron/flight-price-watch периодически перепрогоняет.
-- Per-tenant (company_id) + per-user (личный список "Мои отслеживания").
CREATE TABLE IF NOT EXISTS flight_price_watches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_iata        text NOT NULL,
  destination_iata   text NOT NULL,
  date_mode          text NOT NULL DEFAULT 'exact',
  depart_date        text NOT NULL,
  depart_date_to     text,
  trip_class         text NOT NULL DEFAULT 'economy',
  filters_json       jsonb,
  target_price_rub   integer,
  last_price_rub     integer,
  last_checked_at    timestamp with time zone,
  best_price_rub     integer,
  best_price_at      timestamp with time zone,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_price_watches_company_idx ON flight_price_watches (company_id);
CREATE INDEX IF NOT EXISTS flight_price_watches_active_idx ON flight_price_watches (active);
