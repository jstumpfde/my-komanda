-- #15 Фаза 6: глобальный rate-limit на AI-вызовы (per company per day).
CREATE TABLE IF NOT EXISTS ai_chatbot_quota (
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date        date NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_chatbot_quota_date
  ON ai_chatbot_quota (date);
