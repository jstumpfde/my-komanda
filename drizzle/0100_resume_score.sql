-- AI-скор резюме (отдельно от aiScore — тот считается на этапе демо-завершения,
-- а resume_score выставляется сразу при приёме hh-отклика по данным резюме).
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS resume_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_candidates_resume_score
  ON candidates (vacancy_id, resume_score DESC NULLS LAST);
