-- Мягкое удаление кандидатов («Корзина» как у вакансий).
-- deleted_at IS NOT NULL → карточка в корзине, скрыта из списков/счётчиков,
-- восстанавливается или удаляется навсегда. Авто-очистка — по
-- companies.trash_retention_days (тот же cron-подход, что у вакансий).
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_candidates_deleted_at ON candidates (deleted_at);
