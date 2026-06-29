-- Счётчики AI-токенов на вакансию (миграция 0232).
-- Идемпотентны: ADD COLUMN IF NOT EXISTS.
ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS ai_tokens_in  bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_tokens_out bigint NOT NULL DEFAULT 0;
