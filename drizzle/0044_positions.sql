CREATE TABLE IF NOT EXISTS "positions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text,
  "grade" text,
  "salary_min" integer,
  "salary_max" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "positions_tenant_idx" ON "positions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "positions_department_idx" ON "positions" ("department_id");
