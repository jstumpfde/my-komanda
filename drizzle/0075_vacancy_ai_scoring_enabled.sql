ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS ai_scoring_enabled boolean NOT NULL DEFAULT true;
