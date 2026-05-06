ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS auto_processing_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_vacancies_auto_processing
  ON vacancies(auto_processing_enabled)
  WHERE auto_processing_enabled = TRUE;
