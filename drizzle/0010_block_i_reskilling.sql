-- Block I: Reskilling Center + Predictive Hiring
-- my-komanda migration 0010

-- ─── Reskilling assessments (AI risk per position) ──────────────────────────

CREATE TABLE IF NOT EXISTS reskilling_assessments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position           TEXT NOT NULL,
  department         TEXT,
  automation_risk    INTEGER DEFAULT 0,
  risk_level         TEXT DEFAULT 'low',
  ai_impact_summary  TEXT,
  tasks_at_risk      JSONB,
  recommended_skills JSONB,
  calculated_at      TIMESTAMPTZ DEFAULT now(),
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- ─── Reskilling plans (per employee) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reskilling_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL,
  employee_name    TEXT,
  current_position TEXT,
  target_position  TEXT,
  status           TEXT DEFAULT 'draft',
  progress         INTEGER DEFAULT 0,
  skills           JSONB,
  due_date         TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Predictive hiring alerts ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predictive_hiring_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flight_risk_id    UUID REFERENCES flight_risk_scores(id),
  employee_id       TEXT NOT NULL,
  employee_name     TEXT,
  position          TEXT,
  department        TEXT,
  risk_score        INTEGER,
  status            TEXT DEFAULT 'new',
  vacancy_id        UUID REFERENCES vacancies(id),
  talent_pool_match JSONB,
  created_at        TIMESTAMPTZ DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reskilling_assessments_tenant ON reskilling_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reskilling_plans_tenant ON reskilling_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_tenant ON predictive_hiring_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_status ON predictive_hiring_alerts(status);

-- Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
