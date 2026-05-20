-- Сессия 9 (6b): статус процесса предквалификации на кандидата.
--
-- prequalification_status:
--   NULL          — предкв не запускалась (большинство кандидатов)
--   'pending'     — вопросы отправлены, ждём ответы
--   'passed'      — все критичные ответы passed, отправили демо
--   'failed'      — хотя бы один критичный failed, мягкий отказ
--   'no_answer'   — fallbackDays истёк без ответа, отправили демо без квалификации
--
-- sent_at / completed_at нужны для cron'а напоминаний и аналитики.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS prequalification_status text;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS prequalification_sent_at timestamptz;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS prequalification_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidates_prequalification_pending
  ON candidates (prequalification_sent_at)
  WHERE prequalification_status = 'pending';
