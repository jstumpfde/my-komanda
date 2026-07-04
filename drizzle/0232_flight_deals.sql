-- Бизнес-ассистент → Авиабилеты: лента находок из Telegram-каналов со
-- сливами дешёвых билетов. Платформенная таблица без company_id.
CREATE TABLE IF NOT EXISTS flight_deals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_from          text NOT NULL,
  route_to            text NOT NULL,
  price_rub           integer NOT NULL,
  source_channel      text NOT NULL,
  source_message_url  text NOT NULL UNIQUE,
  raw_text            text NOT NULL,
  ai_extracted_json   jsonb,
  valid_until         timestamp with time zone,
  created_at          timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flight_deals_created_idx ON flight_deals (created_at);
