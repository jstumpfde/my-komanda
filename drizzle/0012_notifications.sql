-- Notifications table (real, from DB)
-- my-komanda migration 0012

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  severity    TEXT DEFAULT 'info',
  source_type TEXT,
  source_id   TEXT,
  href        TEXT,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
