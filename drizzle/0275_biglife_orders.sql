-- Big Life: заказы из корзины biglife.company24.pro (Обложки + Ридер).
-- Захват заказа БЕЗ оплаты (ключей Робокассы пока нет) — доставка + контакты
-- + согласия 152-ФЗ. items — снэпшот корзины на момент отправки, не FK на
-- big_life_covers, переживает переиздание архива обложек.
CREATE TABLE IF NOT EXISTS big_life_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id),
  items                 jsonb NOT NULL,
  total_price           integer NOT NULL,
  delivery_method       text NOT NULL,
  delivery_address      text NOT NULL,
  contact_name          text NOT NULL,
  phone                 text NOT NULL,
  consent_privacy_at    timestamptz NOT NULL,
  consent_offer_at      timestamptz NOT NULL,
  consent_marketing_at  timestamptz,
  status                text NOT NULL DEFAULT 'new',
  ip_hash               text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS big_life_orders_company_idx ON big_life_orders(company_id);
CREATE INDEX IF NOT EXISTS big_life_orders_created_idx ON big_life_orders(created_at);
