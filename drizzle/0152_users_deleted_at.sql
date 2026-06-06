-- Корзина пользователей: soft-delete для очистки списка (демо-наблюдатели,
-- осиротевшие пользователи без компании). NULL = активный.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamp;
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at);
