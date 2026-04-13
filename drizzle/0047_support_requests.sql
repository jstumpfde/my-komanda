CREATE TABLE IF NOT EXISTS support_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  data        JSONB NOT NULL,
  status      TEXT DEFAULT 'new',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_support_requests_tenant ON support_requests(tenant_id);
CREATE INDEX idx_support_requests_status ON support_requests(status);
