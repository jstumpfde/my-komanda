ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "founded_year" integer;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "revenue_range" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_status" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_name" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sales_scripts" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "training_system" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "trainer" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "sales_manager_type" text;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_multi_product" boolean DEFAULT false;

ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "description" text;
