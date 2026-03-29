-- Store hh.ru OAuth tokens per company
CREATE TABLE hh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES companies(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hh_employer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track hh.ru vacancy publishing
CREATE TABLE hh_vacancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID NOT NULL REFERENCES vacancies(id),
  hh_vacancy_id TEXT NOT NULL,
  hh_status TEXT DEFAULT 'active',
  published_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  views INTEGER DEFAULT 0,
  responses INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Track imported resumes
CREATE TABLE hh_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id),
  hh_resume_id TEXT NOT NULL UNIQUE,
  hh_application_id TEXT,
  imported_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
