-- Learning plans (ИПО — индивидуальные планы обучения) + assignments.
-- ai_usage_log already exists (migration 0038 era); no changes needed there.

CREATE TABLE IF NOT EXISTS "learning_plans" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title"       text NOT NULL,
  "description" text,
  "materials"   jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by"  uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"  timestamp DEFAULT now(),
  "updated_at"  timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "learning_plans_tenant_id_idx"
  ON "learning_plans" ("tenant_id");

CREATE TABLE IF NOT EXISTS "learning_assignments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id"      uuid NOT NULL REFERENCES "learning_plans"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id"    uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "status"       text NOT NULL DEFAULT 'assigned',
  "progress"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assigned_at"  timestamp DEFAULT now(),
  "deadline"     timestamp,
  "completed_at" timestamp
);

CREATE INDEX IF NOT EXISTS "learning_assignments_plan_id_idx"
  ON "learning_assignments" ("plan_id");
CREATE INDEX IF NOT EXISTS "learning_assignments_user_id_idx"
  ON "learning_assignments" ("user_id");
CREATE INDEX IF NOT EXISTS "learning_assignments_tenant_id_idx"
  ON "learning_assignments" ("tenant_id");
