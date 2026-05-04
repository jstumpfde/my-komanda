-- HR-020: новые поля кандидатов для рабочих фильтров списка
-- (возраст, опыт лет, формат работы, образование, языки, ключевые навыки,
-- отрасль, готовность к переезду, готовность к командировкам).
-- Поле experience (text) сохраняем — данные конвертируются отдельным
-- скриптом scripts/migrate-experience-text-to-int.ts.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS birth_date            date,
  ADD COLUMN IF NOT EXISTS experience_years      integer,
  ADD COLUMN IF NOT EXISTS work_format           text,
  ADD COLUMN IF NOT EXISTS education_level       text,
  ADD COLUMN IF NOT EXISTS languages             text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS key_skills            text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS industry              text,
  ADD COLUMN IF NOT EXISTS relocation_ready      boolean,
  ADD COLUMN IF NOT EXISTS business_trips_ready  boolean;

CREATE INDEX IF NOT EXISTS idx_candidates_experience_years ON candidates(experience_years);
CREATE INDEX IF NOT EXISTS idx_candidates_birth_date       ON candidates(birth_date);
