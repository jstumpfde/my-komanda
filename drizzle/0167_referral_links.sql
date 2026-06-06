-- Резерв (Talent Pool) → Рефералы: реферальные ссылки сотрудников.
-- Правила программы (бонус/испыт.срок/лимит/отбор) хранятся в
-- companies.hiring_defaults_json -> 'referralRules' (без отдельной таблицы).
CREATE TABLE IF NOT EXISTS referral_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  position        text NOT NULL DEFAULT '',
  slug            text NOT NULL,
  clicks          integer NOT NULL DEFAULT 0,
  referred_count  integer NOT NULL DEFAULT 0,
  hired_count     integer NOT NULL DEFAULT 0,
  created_at      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_links_company ON referral_links(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_links_company_slug ON referral_links(company_id, slug);
