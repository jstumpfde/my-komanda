-- Add postal_code to companies table
-- my-komanda migration 0014

ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code TEXT;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
