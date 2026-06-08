-- Sales/CRM: per-tenant настройки воронки (тип + стадии) и задел под источники/
-- автоматизации. Заменяет хардкод стадий из lib/crm/deal-stages.ts.
CREATE TABLE IF NOT EXISTS "sales_settings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "funnel_type"  text NOT NULL DEFAULT 'booking',
  "stages"       jsonb,
  "lead_sources" jsonb,
  "automations"  jsonb,
  "slot_step_minutes" integer DEFAULT 30,
  "book_ahead_days"   integer DEFAULT 14,
  "created_at"   timestamp DEFAULT now(),
  "updated_at"   timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_settings_tenant_uniq" ON "sales_settings" ("tenant_id");
