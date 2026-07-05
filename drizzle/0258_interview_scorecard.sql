-- Скоркарта интервью (Company24, дизайн координатора, одобрен Юрием 05.07).
-- interview_score = manualOverride ?? autoScore (см. lib/candidates/interview-scorecard.ts).
-- Аддитивная, идемпотентная миграция.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_score integer;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS interview_scorecard_json jsonb;
