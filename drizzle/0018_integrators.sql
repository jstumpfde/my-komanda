CREATE TABLE IF NOT EXISTS integrator_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  min_clients INTEGER DEFAULT 0,
  min_mrr_kopecks INTEGER DEFAULT 0,
  commission_percent TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  level_id UUID REFERENCES integrator_levels(id),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  status TEXT DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrator_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_id UUID NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  referred_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(integrator_id, client_company_id)
);

CREATE TABLE IF NOT EXISTS integrator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_id UUID NOT NULL REFERENCES integrators(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_mrr_kopecks INTEGER DEFAULT 0,
  commission_percent TEXT,
  payout_kopecks INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed уровней
INSERT INTO integrator_levels (name, min_clients, min_mrr_kopecks, commission_percent, sort_order) VALUES
  ('Bronze',   0,   0,        '10', 1),
  ('Silver',   5,   500000,   '12', 2),
  ('Gold',     10,  1000000,  '15', 3),
  ('Platinum', 20,  2000000,  '18', 4),
  ('VIP',      50,  5000000,  '20', 5)
ON CONFLICT DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mykomanda;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mykomanda;
