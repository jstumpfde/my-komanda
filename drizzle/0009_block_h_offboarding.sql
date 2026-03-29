-- Block H: Lifecycle — Offboarding + Exit Surveys + Preboarding/Reboarding templates
-- my-komanda migration 0009

-- ─── Offboarding cases ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offboarding_cases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id      TEXT NOT NULL,
  employee_name    TEXT,
  department       TEXT,
  position         TEXT,
  reason           TEXT DEFAULT 'voluntary',
  last_work_day    TIMESTAMPTZ,
  status           TEXT DEFAULT 'initiated',
  checklist_json   JSONB,
  referral_bridge  BOOLEAN DEFAULT false,
  rehire_eligible  BOOLEAN DEFAULT true,
  notes            TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Exit surveys ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exit_surveys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id          UUID NOT NULL REFERENCES offboarding_cases(id) ON DELETE CASCADE,
  channel          TEXT DEFAULT 'web',
  status           TEXT DEFAULT 'pending',
  sent_at          TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  responses        JSONB,
  overall_score    INTEGER,
  would_return     BOOLEAN,
  would_recommend  BOOLEAN,
  open_feedback    TEXT,
  is_anonymous     BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offboarding_tenant ON offboarding_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_status ON offboarding_cases(status);
CREATE INDEX IF NOT EXISTS idx_exit_surveys_case ON exit_surveys(case_id);

-- Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
