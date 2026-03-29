-- Block J: Skills Marketplace + AI Agent Chat
-- my-komanda migration 0011

-- ─── Internal projects (skills marketplace) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS internal_projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  department       TEXT,
  required_skills  JSONB,
  status           TEXT DEFAULT 'open',
  max_participants INTEGER DEFAULT 5,
  start_date       TIMESTAMPTZ,
  end_date         TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Project applications ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_applications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES internal_projects(id) ON DELETE CASCADE,
  employee_id    TEXT NOT NULL,
  employee_name  TEXT,
  department     TEXT,
  motivation     TEXT,
  match_score    INTEGER,
  status         TEXT DEFAULT 'pending',
  applied_at     TIMESTAMPTZ DEFAULT now(),
  resolved_at    TIMESTAMPTZ,
  UNIQUE(project_id, employee_id)
);

-- ─── AI chat messages ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  session_id  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON internal_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON internal_projects(status);
CREATE INDEX IF NOT EXISTS idx_applications_project ON project_applications(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_tenant ON ai_chat_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_session ON ai_chat_messages(session_id);

-- Grants
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
