-- Корзина вакансий: per-company срок хранения в днях. По истечении срока
-- cron /api/cron/trash-cleanup удаляет вакансии навсегда (status в корзине =
-- vacancies.deleted_at IS NOT NULL; отдельной колонки trashed_at не вводим —
-- deleted_at уже выполняет эту роль).
--   DEFAULT 30 — рекомендованное значение.
--   Допустимые значения в UI/API: 1 / 3 / 7 / 14 / 30 / 60 / 90.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trash_retention_days integer NOT NULL DEFAULT 30;
