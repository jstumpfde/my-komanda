-- 0220: архив компаний-клиентов.
-- Жизненный цикл: Активна → Архив → Корзина.
-- Признак архива — archived_at IS NOT NULL (отдельного статуса не вводим).
-- Идемпотентно (IF NOT EXISTS) — безопасно гонять повторно.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS archived_at timestamp;

CREATE INDEX IF NOT EXISTS companies_archived_at_idx ON companies(archived_at);

-- Конвенция проекта: новые таблицы/колонки доступны приложению.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
