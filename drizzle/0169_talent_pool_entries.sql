-- Резерв (Talent Pool) → ручные/CSV записи «Базы». Пассивные кандидаты, добавленные
-- вручную или импортом CSV (не из откликов на вакансию).
CREATE TABLE IF NOT EXISTS talent_pool_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  position    text NOT NULL DEFAULT '',
  company     text NOT NULL DEFAULT '',
  source      text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  phone       text NOT NULL DEFAULT '',
  telegram    text NOT NULL DEFAULT '',
  comment     text NOT NULL DEFAULT '',
  score       integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'cold',
  created_at  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_talent_pool_entries_company ON talent_pool_entries(company_id);
