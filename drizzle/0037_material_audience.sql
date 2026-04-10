-- Material audience targeting: where a demo template / article is visible.
-- Values: "employees" | "candidates" | "clients" (jsonb array of strings).

ALTER TABLE "demo_templates"
  ADD COLUMN IF NOT EXISTS "audience" jsonb DEFAULT '["candidates"]'::jsonb;

ALTER TABLE "knowledge_articles"
  ADD COLUMN IF NOT EXISTS "audience" jsonb DEFAULT '["employees"]'::jsonb;
