CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  category TEXT NOT NULL,
  channel_email BOOLEAN DEFAULT true,
  channel_telegram BOOLEAN DEFAULT false,
  channel_push BOOLEAN DEFAULT false,
  channel_web BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, module, category)
);
CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
