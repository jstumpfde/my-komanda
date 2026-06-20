-- Корзина для компаний единой базы (Емайл маркетинг).
-- Мягкое удаление: deleted_at IS NULL — активные, IS NOT NULL — в корзине.
-- (Аналогично корзине вакансий: отдельного status='trashed' НЕ вводим.)
ALTER TABLE outreach_companies ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Индекс под фильтр «активные / корзина» в пределах тенанта.
CREATE INDEX IF NOT EXISTS outreach_companies_deleted_idx
  ON outreach_companies (company_id, deleted_at);
