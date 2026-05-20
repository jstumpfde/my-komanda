-- Сессия 6: ответы кандидата на вопросы предквалификации.
--
-- Связь candidate × question. Для одной (candidate, vacancy) пары может
-- быть до 3 строк — по одной на каждый вопрос из vacancy.ai_process_settings
-- .prequalification.questions. ai_verdict выставляется backend'ом (Haiku).
-- is_critical — snapshot значения required в момент задавания вопроса
-- (если HR потом поменяет required в настройках — старые ответы
-- сохранят свою критичность).

CREATE TABLE IF NOT EXISTS candidate_qualification_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id      uuid NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  question_text   text NOT NULL,
  answer_text     text,
  ai_verdict      text,        -- 'passed' | 'failed' | 'unclear' | NULL (ожидаем)
  ai_reasoning    text,
  is_critical     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualification_answers_candidate
  ON candidate_qualification_answers (candidate_id, created_at DESC);
