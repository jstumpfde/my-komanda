-- Резерв: жизненный цикл записей (Архив → Корзина → удаление).
-- «Не подходит» → archived_at (сохранён, но больше не ищем).
-- Архив → Корзина (trashed_at). Авто-перемещение/удаление — крон (срок в hiring_defaults_json).
ALTER TABLE talent_pool_entries ADD COLUMN IF NOT EXISTS archived_at timestamp;
ALTER TABLE talent_pool_entries ADD COLUMN IF NOT EXISTS trashed_at  timestamp;
