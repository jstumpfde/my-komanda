-- HH.ru Integration tables

CREATE TABLE IF NOT EXISTS hh_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employer_id     TEXT NOT NULL,
  employer_name   TEXT,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  connected_by    UUID REFERENCES users(id),
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_hh_integrations_company UNIQUE (company_id)
);

CREATE TABLE IF NOT EXISTS hh_vacancies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hh_vacancy_id   TEXT NOT NULL,
  title           TEXT NOT NULL,
  area_name       TEXT,
  salary_from     INTEGER,
  salary_to       INTEGER,
  salary_currency TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  responses_count INTEGER DEFAULT 0,
  url             TEXT,
  local_vacancy_id UUID REFERENCES vacancies(id),
  raw_data        JSONB,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_hh_vacancies_company_hh UNIQUE (company_id, hh_vacancy_id)
);

CREATE TABLE IF NOT EXISTS hh_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  hh_vacancy_id   TEXT NOT NULL,
  hh_response_id  TEXT NOT NULL,
  candidate_name  TEXT,
  candidate_phone TEXT,
  candidate_email TEXT,
  resume_title    TEXT,
  resume_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'new',
  raw_data        JSONB,
  local_candidate_id UUID,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_hh_responses_company_response UNIQUE (company_id, hh_response_id)
);

CREATE INDEX IF NOT EXISTS idx_hh_integrations_company ON hh_integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_hh_vacancies_company ON hh_vacancies(company_id);
CREATE INDEX IF NOT EXISTS idx_hh_responses_company ON hh_responses(company_id);
CREATE INDEX IF NOT EXISTS idx_hh_responses_vacancy ON hh_responses(company_id, hh_vacancy_id);
