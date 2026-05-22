-- #15 Фаза 1: scaffolding для AI-чат-бота кандидатов.
-- Колонки добавляются заранее, чтобы UI можно было сохранить уже сейчас
-- (когда фича будет активирована в Фазах 2-6). Default values безопасны:
-- enabled=false означает «не активен», settings={} даёт пустой JSON,
-- prompt='' — пустая строка.

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS ai_chatbot_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_chatbot_settings jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_chatbot_prompt   text    NOT NULL DEFAULT '';
