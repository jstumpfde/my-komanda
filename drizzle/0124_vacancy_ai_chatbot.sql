-- #15 Фаза 1: scaffolding для AI-чат-бота кандидатов.
ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS ai_chatbot_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_chatbot_settings jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_chatbot_prompt   text    NOT NULL DEFAULT '';
