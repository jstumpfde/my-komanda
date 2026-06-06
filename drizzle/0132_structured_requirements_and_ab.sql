-- Group 25: Structured vacancy requirements + A/B scoring (v1 vs v2).
--
-- vacancies.requirementsJson — must_have / nice_to_have / deal_breakers /
-- ideal_profile + scoring_weights. Используются двухпроходным скорингом v2
-- (lib/ai-score-candidate-v2.ts).
--
-- candidates.aiScoreV1 / aiScoreV2 / aiScoreV2Details — A/B сравнение
-- результатов старого скоринга (scoreCandidateById, v1) и нового
-- структурированного (scoreCandidateV2). aiScore остаётся основным
-- (= v2 если доступен, иначе v1). aiScoredAt — момент оценки.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS requirements_json jsonb DEFAULT '{}'::jsonb;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS ai_score_v1 numeric,
  ADD COLUMN IF NOT EXISTS ai_score_v2 numeric,
  ADD COLUMN IF NOT EXISTS ai_score_v2_details jsonb,
  ADD COLUMN IF NOT EXISTS ai_scored_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidates_scored
  ON candidates(ai_scored_at)
  WHERE ai_scored_at IS NOT NULL;
