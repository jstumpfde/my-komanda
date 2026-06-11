-- migration 0202: yandex_direct_agent
-- AI-агент Яндекс.Директ (модуль marketing): OAuth-интеграция, зеркало
-- кампаний, дневная статистика, журнал рекомендаций/действий агента.

CREATE TABLE IF NOT EXISTS yandex_direct_integrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  yandex_login        TEXT,
  access_token        TEXT NOT NULL,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  connected_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_settings_json JSONB,
  last_synced_at      TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS yandex_direct_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direct_id        BIGINT NOT NULL,
  name             TEXT NOT NULL,
  campaign_type    TEXT NOT NULL DEFAULT 'TEXT_CAMPAIGN',
  placement        TEXT,
  state            TEXT,
  status           TEXT,
  daily_budget     DOUBLE PRECISION,
  created_by_agent BOOLEAN NOT NULL DEFAULT false,
  raw              JSONB,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS yd_campaigns_company_direct_idx
  ON yandex_direct_campaigns(company_id, direct_id);

CREATE TABLE IF NOT EXISTS yandex_direct_campaign_stats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direct_id   BIGINT NOT NULL,
  date        TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  cost        DOUBLE PRECISION NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS yd_stats_company_campaign_date_idx
  ON yandex_direct_campaign_stats(company_id, direct_id, date);

CREATE TABLE IF NOT EXISTS yandex_direct_agent_actions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  direct_campaign_id BIGINT,
  type               TEXT NOT NULL,
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  payload            JSONB,
  impact             TEXT,
  status             TEXT NOT NULL DEFAULT 'proposed',
  source             TEXT NOT NULL DEFAULT 'agent',
  applied_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_at         TIMESTAMPTZ,
  error              TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS yd_actions_company_status_idx
  ON yandex_direct_agent_actions(company_id, status, created_at);
