-- #15 Фаза 4: журнал сообщений AI-чат-бота для метрик и аудита.
CREATE TABLE IF NOT EXISTS ai_chatbot_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id        uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vacancy_id          uuid NOT NULL REFERENCES vacancies(id)  ON DELETE CASCADE,
  incoming_message    text NOT NULL,
  intent_category     text NOT NULL,        -- salary | schedule | location | requirements | call_request | demo_check_in | interview_scheduling | rejection_signal | other
  intent_confidence   real NOT NULL,        -- 0.0..1.0
  generated_reply     text,                 -- NULL если эскалация (не ответили автоматически)
  sent_at             timestamptz,          -- NULL если не дошло до отправки
  escalated_to_hr     boolean NOT NULL DEFAULT false,
  escalation_reason   text,                 -- low_confidence | not_in_triggers | daily_limit | rejection_signal | stop_word | other
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chatbot_messages_candidate_date
  ON ai_chatbot_messages (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_chatbot_messages_vacancy_date
  ON ai_chatbot_messages (vacancy_id, created_at DESC);
