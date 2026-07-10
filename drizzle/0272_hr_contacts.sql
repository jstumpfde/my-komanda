-- Личные контакты HR для оперативной связи с кандидатом (10.07).
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_telegram text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_max text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone text;
