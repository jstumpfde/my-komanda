CREATE TABLE IF NOT EXISTS "user_schedules" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id"    UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "week_schedule" JSONB NOT NULL,
  "timezone"      TEXT DEFAULT 'Europe/Moscow',
  "created_at"    TIMESTAMP DEFAULT now(),
  "updated_at"    TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_schedules_user" ON "user_schedules"("user_id");
CREATE INDEX        IF NOT EXISTS "idx_user_schedules_company" ON "user_schedules"("company_id");
