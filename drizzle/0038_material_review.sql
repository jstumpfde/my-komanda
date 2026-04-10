-- Material review metadata: periodic check cycle + optional hard expiry.
-- review_cycle values: "none" | "1m" | "3m" | "6m" | "1y"

ALTER TABLE "demo_templates"
  ADD COLUMN IF NOT EXISTS "review_cycle" text DEFAULT 'none';

ALTER TABLE "demo_templates"
  ADD COLUMN IF NOT EXISTS "valid_until" timestamp;

ALTER TABLE "knowledge_articles"
  ADD COLUMN IF NOT EXISTS "review_cycle" text DEFAULT 'none';

ALTER TABLE "knowledge_articles"
  ADD COLUMN IF NOT EXISTS "valid_until" timestamp;
