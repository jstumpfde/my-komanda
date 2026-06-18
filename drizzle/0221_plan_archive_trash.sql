-- 0221: архив и корзина тарифных планов.
-- Жизненный цикл: Активен → Архив → Корзина.
-- Признак архива — archived_at IS NOT NULL (столбец уже был, но без deleted_at).
-- Признак корзины — deleted_at IS NOT NULL.
-- Идемпотентно (IF NOT EXISTS) — безопасно гонять повторно.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

CREATE INDEX IF NOT EXISTS plans_archived_at_idx ON plans(archived_at);
CREATE INDEX IF NOT EXISTS plans_deleted_at_idx  ON plans(deleted_at);

-- Конвенция проекта: новые таблицы/колонки доступны приложению.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
