-- Группа 36: per-company «режим строгости» AI-чат-бота при работе с
-- неуважительным общением. Применяется к severe_abuse:
--   strict (default) — автоотказ + сообщение «Мы прекращаем общение»
--   lenient          — предупреждение «Прошу общаться корректно», диалог
--                      продолжается; счётчик medium_abuse продолжает расти,
--                      на 2-м повторе всё-таки автоотказ.
-- injection всегда auto-reject — это безопасность, не тон.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_abuse_mode text NOT NULL DEFAULT 'strict';
