-- Sales/CRM: каталог товаров/услуг (прайс-лист для сделок), per-tenant.
CREATE TABLE IF NOT EXISTS "sales_products" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "category"    text,
  "description" text,
  "price"       integer DEFAULT 0,
  "unit"        text DEFAULT 'шт',
  "vat"         integer DEFAULT 20,
  "status"      text DEFAULT 'active',
  "created_at"  timestamp DEFAULT now(),
  "updated_at"  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sales_products_tenant_idx" ON "sales_products" ("tenant_id");
