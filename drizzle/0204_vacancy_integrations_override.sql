-- Миграция 0204: per-vacancy override интеграций (уровень 3).
-- Наследование: enabled=true → используются поля вакансии; иначе → компания.
-- Идемпотентная (ALTER ... IF NOT EXISTS).

ALTER TABLE vacancies
  ADD COLUMN IF NOT EXISTS integrations_override jsonb NOT NULL DEFAULT '{}';
