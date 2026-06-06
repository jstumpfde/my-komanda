-- Структурированные ответы кандидата на вопросы task-блоков теста.
-- Идемпотентно: добавляем JSONB-колонку, если её ещё нет.
ALTER TABLE test_submissions ADD COLUMN IF NOT EXISTS answers_json jsonb;
