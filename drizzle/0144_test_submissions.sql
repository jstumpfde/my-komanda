-- Публичная страница теста (/test/[token]): ответы кандидатов на тестовое
-- задание. Изолированная таблица — не трогает candidates/demos потоки.
-- ai_score/ai_reasoning заполняются на Этапе 2 (AI-скоринг).
CREATE TABLE IF NOT EXISTS test_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  demo_id       uuid REFERENCES demos(id) ON DELETE SET NULL,
  answer_text   text,
  file_url      text,
  ai_score      integer,
  ai_reasoning  text,
  submitted_at  timestamp DEFAULT now()
);

-- Карточка кандидата у HR ищет сабмишн по candidate_id (один-к-одному в норме).
CREATE INDEX IF NOT EXISTS idx_test_submissions_candidate ON test_submissions(candidate_id);
