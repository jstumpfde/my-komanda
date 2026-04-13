CREATE TABLE IF NOT EXISTS ai_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  vacancy_id      UUID REFERENCES vacancies(id) ON DELETE SET NULL,
  candidate_id    UUID,
  input_summary   TEXT,
  output_summary  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_audit_tenant ON ai_audit_log(tenant_id);
CREATE INDEX idx_ai_audit_action ON ai_audit_log(action);
CREATE INDEX idx_ai_audit_vacancy ON ai_audit_log(vacancy_id);
CREATE INDEX idx_ai_audit_created ON ai_audit_log(created_at);
