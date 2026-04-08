ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "join_code" text UNIQUE;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "join_enabled" boolean DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '{}'::jsonb;
