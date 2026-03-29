-- Invite links table
-- my-komanda migration 0013

CREATE TABLE IF NOT EXISTS invite_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  token       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL,           -- director|hr_lead|hr_manager|department_head|observer
  label       TEXT,                    -- необязательное описание
  max_uses    INTEGER DEFAULT 1,       -- NULL = безлимит
  uses_count  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  expires_at  TIMESTAMPTZ,             -- NULL = бессрочно
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_links_token      ON invite_links(token);
CREATE INDEX IF NOT EXISTS idx_invite_links_company    ON invite_links(company_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_active     ON invite_links(is_active) WHERE is_active = true;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
