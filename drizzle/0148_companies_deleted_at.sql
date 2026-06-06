-- Корзина компаний (по образцу корзины вакансий). Soft-delete через deleted_at:
-- NULL — компания активна; не-NULL — в корзине. Cron trash-cleanup удалит
-- навсегда, когда deleted_at старше companies.trash_retention_days.
--
-- ВАЖНО: жёсткое удаление компании сносит весь тенант (64 FK ON DELETE CASCADE),
-- поэтому permanent/cron используют lib/companies/hard-delete.ts с гардами.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at timestamp;

-- Частичный индекс — выборка корзины и cron-очистки.
CREATE INDEX IF NOT EXISTS idx_companies_deleted_at ON companies(deleted_at)
  WHERE deleted_at IS NOT NULL;
