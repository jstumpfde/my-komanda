-- Группа 30: AI-чат-бот v2 — счётчик предупреждений за неуважительное общение.
-- Используется логикой 3 уровней грубости в lib/ai/chatbot-processor.ts:
--   medium_abuse → +1 счётчика; при 2-м срабатывании → автоотказ.
--
-- DEFAULT 0 — безопасно для существующих кандидатов (никакого эффекта).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS abuse_warnings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_abuse_warning_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_candidates_abuse
  ON candidates(abuse_warnings_count)
  WHERE abuse_warnings_count > 0;
