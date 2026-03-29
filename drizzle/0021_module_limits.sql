-- Add custom limits and history tracking to tenant_modules
ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS custom_limits JSONB;
ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS enabled_at TIMESTAMPTZ;
ALTER TABLE tenant_modules ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- Add limits JSONB to plan_modules for flexible limit storage
ALTER TABLE plan_modules ADD COLUMN IF NOT EXISTS limits JSONB;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
