CREATE TABLE IF NOT EXISTS comparison_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  data        JSONB NOT NULL,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comparison_links_token ON comparison_links(token);
