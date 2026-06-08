-- HR: лог контактов с кандидатом (звонки/видео/встречи) с исходом подошёл/не подошёл.
-- channel/outcome — lib/hr/contacts.ts; reason_category (при no_fit) — lib/hr/rejection-reasons.ts.
CREATE TABLE IF NOT EXISTS "candidate_contacts" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"       uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "candidate_id"    uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "vacancy_id"      uuid,
  "channel"         text DEFAULT 'call',
  "outcome"         text DEFAULT 'pending',
  "reason_category" text,
  "comment"         text,
  "created_by_id"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "candidate_contacts_candidate_idx" ON "candidate_contacts" ("candidate_id");
CREATE INDEX IF NOT EXISTS "candidate_contacts_tenant_idx" ON "candidate_contacts" ("tenant_id");
