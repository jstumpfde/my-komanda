-- 0222: модуль «Проработка базы» (outreach) — единая база компаний по ИНН.
-- Грузим разнородные xlsx (ГлобусВЭД / портал / ЕГРЮЛ / звонки) сколько угодно
-- раз → дедуп по ИНН (без перезаписи, только ДОПОЛНЕНИЕ) → копим провенанс.
-- Тенант-скоуп по company_id. Идемпотентно (IF NOT EXISTS) — безопасно повторно.

CREATE TABLE IF NOT EXISTS outreach_companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inn           text,
  inn_norm      text,
  name          text,
  full_name     text,
  region        text,
  address       text,
  website       text,
  okved_code    text,
  okved_name    text,
  ogrn          text,
  kpp           text,
  description   text,
  segment       text,
  status        text NOT NULL DEFAULT 'new',
  enriched      boolean NOT NULL DEFAULT false,
  data_json     jsonb,
  sources_json  jsonb,
  dedup_key     text,
  first_seen_at timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- NULL inn_norm в PG считаются разными → строки без ИНН не конфликтуют по этому индексу.
CREATE UNIQUE INDEX IF NOT EXISTS outreach_companies_company_inn_idx ON outreach_companies(company_id, inn_norm);
CREATE INDEX IF NOT EXISTS outreach_companies_company_idx ON outreach_companies(company_id);
CREATE INDEX IF NOT EXISTS outreach_companies_dedup_idx   ON outreach_companies(company_id, dedup_key);
CREATE INDEX IF NOT EXISTS outreach_companies_status_idx  ON outreach_companies(company_id, status);

CREATE TABLE IF NOT EXISTS outreach_contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES outreach_companies(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  value       text NOT NULL,
  value_raw   text,
  person_name text,
  position    text,
  source      text,
  created_at  timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS outreach_contacts_uniq_idx   ON outreach_contacts(target_id, kind, value);
CREATE INDEX IF NOT EXISTS outreach_contacts_company_idx ON outreach_contacts(company_id);
CREATE INDEX IF NOT EXISTS outreach_contacts_target_idx  ON outreach_contacts(target_id);

CREATE TABLE IF NOT EXISTS outreach_trade (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_id      uuid NOT NULL REFERENCES outreach_companies(id) ON DELETE CASCADE,
  direction      text,
  tnved_codes    jsonb,
  countries      jsonb,
  supplies_count integer,
  supply_sum_usd double precision,
  supply_sum_rub double precision,
  weight_net     double precision,
  revenue_rub    double precision,
  year           integer,
  source         text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_trade_company_idx ON outreach_trade(company_id);
CREATE INDEX IF NOT EXISTS outreach_trade_target_idx  ON outreach_trade(target_id);

CREATE TABLE IF NOT EXISTS outreach_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  filename       text NOT NULL,
  source_type    text NOT NULL DEFAULT 'unknown',
  status         text NOT NULL DEFAULT 'done',
  rows_total     integer NOT NULL DEFAULT 0,
  rows_created   integer NOT NULL DEFAULT 0,
  rows_merged    integer NOT NULL DEFAULT 0,
  rows_skipped   integer NOT NULL DEFAULT 0,
  contacts_added integer NOT NULL DEFAULT 0,
  mapping_json   jsonb,
  error          text,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_imports_company_idx ON outreach_imports(company_id);

-- Подключение к сервису рассылки — своё на каждую компанию (per-tenant).
CREATE TABLE IF NOT EXISTS outreach_integrations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  api_key       text,
  label         text,
  status        text NOT NULL DEFAULT 'disconnected',
  last_check_at timestamptz,
  last_error    text,
  settings_json jsonb,
  connected_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Конвенция проекта: новые таблицы доступны приложению.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
