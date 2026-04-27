ALTER TABLE demos ADD COLUMN IF NOT EXISTS post_demo_settings jsonb DEFAULT '{}';
