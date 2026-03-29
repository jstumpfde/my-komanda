ALTER TABLE plan_modules ADD COLUMN IF NOT EXISTS allow_custom_branding BOOLEAN DEFAULT false;
ALTER TABLE plan_modules ADD COLUMN IF NOT EXISTS allow_custom_colors BOOLEAN DEFAULT false;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
