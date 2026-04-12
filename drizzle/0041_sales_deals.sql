CREATE TABLE IF NOT EXISTS "sales_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "amount" integer,
  "currency" text DEFAULT 'RUB',
  "stage" text DEFAULT 'new' NOT NULL,
  "priority" text DEFAULT 'medium',
  "probability" integer DEFAULT 0,
  "company_id" uuid REFERENCES "sales_companies"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "sales_contacts"("id") ON DELETE SET NULL,
  "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "description" text,
  "source" text,
  "expected_close_date" timestamp,
  "closed_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_deals_tenant_idx" ON "sales_deals" ("tenant_id");
CREATE INDEX IF NOT EXISTS "sales_deals_stage_idx" ON "sales_deals" ("tenant_id", "stage");
CREATE INDEX IF NOT EXISTS "sales_deals_company_idx" ON "sales_deals" ("company_id");
