-- drizzle/0217_product_pricing.sql
-- Продукты и цены + скидка за набор
-- Идемпотентно (IF NOT EXISTS / IF NOT EXISTS)

-- ─── product_pricing: цена модуля в плане ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "product_pricing" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id"        uuid NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "module_id"      uuid NOT NULL REFERENCES "modules"("id") ON DELETE CASCADE,
  "price_kopecks"  integer NOT NULL DEFAULT 0,
  "currency"       text NOT NULL DEFAULT 'RUB',
  "is_active"      boolean NOT NULL DEFAULT true,
  "sort_order"     integer NOT NULL DEFAULT 0,
  "created_at"     timestamp DEFAULT now(),
  "updated_at"     timestamp DEFAULT now(),
  CONSTRAINT "product_pricing_plan_module_unique" UNIQUE ("plan_id", "module_id")
);

-- ─── bundle_discounts: скидка за количество продуктов ────────────────────────
CREATE TABLE IF NOT EXISTS "bundle_discounts" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id"          uuid NOT NULL REFERENCES "plans"("id") ON DELETE CASCADE,
  "min_products"     integer NOT NULL,
  "max_products"     integer,
  "discount_percent" integer NOT NULL DEFAULT 0,
  "description"      text,
  "is_active"        boolean NOT NULL DEFAULT true,
  "created_at"       timestamp DEFAULT now(),
  CONSTRAINT "bundle_discounts_plan_min_products_unique" UNIQUE ("plan_id", "min_products")
);

-- ─── tenant_modules: новые billing-колонки ───────────────────────────────────
ALTER TABLE "tenant_modules"
  ADD COLUMN IF NOT EXISTS "price_kopecks"            integer,
  ADD COLUMN IF NOT EXISTS "applied_discount_percent" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantity"                 integer NOT NULL DEFAULT 1;
