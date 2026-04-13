CREATE TABLE IF NOT EXISTS vacancy_guest_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id  UUID NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  password    TEXT,
  permissions JSONB DEFAULT '{"view": true}',
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_guest_links_token ON vacancy_guest_links(token);
CREATE INDEX idx_guest_links_vacancy ON vacancy_guest_links(vacancy_id);
