CREATE TABLE IF NOT EXISTS vacancy_intake_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  password    TEXT,
  status      TEXT DEFAULT 'active',
  reusable    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vacancy_intakes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  link_id     UUID REFERENCES vacancy_intake_links(id) ON DELETE SET NULL,
  data        JSONB NOT NULL,
  files       JSONB DEFAULT '[]',
  status      TEXT DEFAULT 'new',
  vacancy_id  UUID REFERENCES vacancies(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_intake_links_token ON vacancy_intake_links(token);
CREATE INDEX idx_intake_links_tenant ON vacancy_intake_links(tenant_id);
CREATE INDEX idx_intakes_tenant ON vacancy_intakes(tenant_id);
CREATE INDEX idx_intakes_status ON vacancy_intakes(status);
