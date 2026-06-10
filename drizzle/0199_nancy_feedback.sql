-- migration 0199: nancy_feedback
-- Фидбек 👍/👎 по ответам Нэнси.
-- Основа самообучения: накопленные 👎 анализируются для пополнения
-- customInstructions и базы знаний (следующий шаг — дайджест частых «не знаю»).

CREATE TABLE IF NOT EXISTS nancy_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  rating      TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  module      TEXT,
  page        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nancy_feedback_company_id ON nancy_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_nancy_feedback_rating     ON nancy_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_nancy_feedback_created_at ON nancy_feedback(created_at DESC);
