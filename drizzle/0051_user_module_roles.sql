CREATE TABLE IF NOT EXISTS user_module_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id   TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'none',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, module_id)
);

CREATE INDEX idx_user_module_roles_user ON user_module_roles(user_id);
CREATE INDEX idx_user_module_roles_tenant ON user_module_roles(tenant_id);
