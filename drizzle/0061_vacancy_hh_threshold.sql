ALTER TABLE vacancies ADD COLUMN IF NOT EXISTS hh_score_threshold integer DEFAULT 20 NOT NULL;
