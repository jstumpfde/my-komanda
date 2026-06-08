-- Sales/CRM: задачи отдела продаж (per-tenant), опциональная привязка к сделке.
CREATE TABLE IF NOT EXISTS "sales_tasks" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"     uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title"         text NOT NULL,
  "description"   text,
  "priority"      text DEFAULT 'medium',
  "due_date"      date,
  "done"          boolean DEFAULT false,
  "deal_id"       uuid REFERENCES "sales_deals"("id") ON DELETE SET NULL,
  "assignee_name" text,
  "created_at"    timestamp DEFAULT now(),
  "updated_at"    timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_tasks_tenant_idx" ON "sales_tasks" ("tenant_id");
