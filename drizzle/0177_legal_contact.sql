ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_contact_json jsonb NOT NULL DEFAULT '{}'::jsonb;
