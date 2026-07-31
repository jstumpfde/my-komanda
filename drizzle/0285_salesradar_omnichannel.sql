-- migration 0285 (было 0278 — номер занят main под content_block_public_link): SalesRadar — омниканальное расширение AI-РОП (Фаза 1, шаг 1)
-- Модель данных для склейки каналов (почта/telegram/whatsapp/...) и
-- привязки коммуникаций к сделкам. Strangler-подход: rop_calls остаётся
-- «взаимодействием/эпизодом» без изменений логики, только +3 nullable
-- колонки-денормализации; вся новая механика — в 7 новых таблицах.
-- Идемпотентная (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- См. lib/db/schema.ts, блок "SalesRadar — омниканальное расширение AI-РОП".

-- Подключённый канал коммуникации
CREATE TABLE IF NOT EXISTS rop_channel_connectors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  provider_key     text,
  title            text,
  mode             text NOT NULL DEFAULT 'pull',
  credentials_enc  jsonb,
  config           jsonb DEFAULT '{}',
  webhook_secret   text,
  cursor_json      jsonb,
  country          text DEFAULT 'RU',
  is_enabled       boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'pending',
  last_sync_at     timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_channel_connectors_company_idx ON rop_channel_connectors (company_id, is_enabled);
CREATE INDEX IF NOT EXISTS rop_channel_connectors_sync_idx ON rop_channel_connectors (is_enabled, last_sync_at);

-- Контрагент — шире клиента
CREATE TABLE IF NOT EXISTS rop_counterparties (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind               text NOT NULL DEFAULT 'unknown',
  name               text,
  display_hint       text,
  inn                text,
  bitrix_contact_id  text,
  bitrix_company_id  text,
  primary_phone      text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_activity_at   timestamptz,
  is_archived        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_counterparties_company_idx ON rop_counterparties (company_id);
CREATE INDEX IF NOT EXISTS rop_counterparties_company_activity_idx ON rop_counterparties (company_id, last_activity_at);
CREATE INDEX IF NOT EXISTS rop_counterparties_phone_idx ON rop_counterparties (company_id, primary_phone) WHERE primary_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_counterparties_bitrix_contact_idx ON rop_counterparties (company_id, bitrix_contact_id) WHERE bitrix_contact_id IS NOT NULL;

-- Идентификатор контрагента в канале — ключ склейки
CREATE TABLE IF NOT EXISTS rop_counterparty_identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id  uuid NOT NULL REFERENCES rop_counterparties(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  value            text NOT NULL,
  confidence       numeric NOT NULL DEFAULT 1.0,
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rop_counterparty_identities_company_kind_value_uniq UNIQUE (company_id, kind, value)
);
CREATE INDEX IF NOT EXISTS rop_counterparty_identities_counterparty_idx ON rop_counterparty_identities (counterparty_id);

-- Сделка-нить (CRM или теневая)
CREATE TABLE IF NOT EXISTS rop_deal_threads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  counterparty_id   uuid REFERENCES rop_counterparties(id) ON DELETE SET NULL,
  kind              text NOT NULL DEFAULT 'shadow',
  bitrix_deal_id    text,
  bitrix_lead_id    text,
  title             text,
  stage             text,
  amount            numeric,
  currency          text DEFAULT 'RUB',
  status            text NOT NULL DEFAULT 'open',
  profile_json      jsonb DEFAULT '{}',
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_activity_at  timestamptz,
  confidence        numeric NOT NULL DEFAULT 1.0,
  created_by        text NOT NULL DEFAULT 'human',
  merged_into_id    uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rop_deal_threads_company_bitrix_deal_uniq ON rop_deal_threads (company_id, bitrix_deal_id) WHERE bitrix_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_deal_threads_company_idx ON rop_deal_threads (company_id);
CREATE INDEX IF NOT EXISTS rop_deal_threads_company_status_idx ON rop_deal_threads (company_id, status);
CREATE INDEX IF NOT EXISTS rop_deal_threads_counterparty_idx ON rop_deal_threads (counterparty_id) WHERE counterparty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_deal_threads_company_activity_idx ON rop_deal_threads (company_id, last_activity_at);

-- Сырое сообщение из коннектора
CREATE TABLE IF NOT EXISTS rop_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connector_id        uuid NOT NULL REFERENCES rop_channel_connectors(id) ON DELETE CASCADE,
  thread_key          text NOT NULL,
  external_id         text NOT NULL,
  counterparty_id     uuid REFERENCES rop_counterparties(id) ON DELETE SET NULL,
  direction           text,
  author_external_id  text,
  author_name         text,
  is_ours             boolean NOT NULL DEFAULT false,
  text                text,
  attachments_json    jsonb,
  sent_at             timestamptz NOT NULL,
  interaction_id      uuid REFERENCES rop_calls(id) ON DELETE SET NULL,
  attribution_status  text NOT NULL DEFAULT 'pending',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rop_messages_connector_external_uniq UNIQUE (connector_id, external_id)
);
CREATE INDEX IF NOT EXISTS rop_messages_company_thread_idx ON rop_messages (company_id, thread_key, sent_at);
CREATE INDEX IF NOT EXISTS rop_messages_attribution_idx ON rop_messages (attribution_status, company_id);
CREATE INDEX IF NOT EXISTS rop_messages_counterparty_idx ON rop_messages (counterparty_id) WHERE counterparty_id IS NOT NULL;

-- Привязка сообщение↔сделка (с историей переклассификации)
CREATE TABLE IF NOT EXISTS rop_message_deal_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id         uuid REFERENCES rop_messages(id) ON DELETE CASCADE,
  interaction_id     uuid REFERENCES rop_calls(id) ON DELETE CASCADE,
  segment_index      integer,
  deal_thread_id     uuid NOT NULL REFERENCES rop_deal_threads(id) ON DELETE CASCADE,
  confidence         numeric NOT NULL,
  method             text NOT NULL,
  model_version      text,
  evidence           text,
  superseded_by_id   uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rop_message_deal_links_message_active_uniq ON rop_message_deal_links (message_id) WHERE superseded_by_id IS NULL AND message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_message_deal_links_deal_thread_idx ON rop_message_deal_links (deal_thread_id);
CREATE INDEX IF NOT EXISTS rop_message_deal_links_interaction_idx ON rop_message_deal_links (interaction_id) WHERE interaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_message_deal_links_company_idx ON rop_message_deal_links (company_id);

-- Факты по сделке (обещано/упущено/можно лучше)
CREATE TABLE IF NOT EXISTS rop_deal_facts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_thread_id  uuid NOT NULL REFERENCES rop_deal_threads(id) ON DELETE CASCADE,
  interaction_id  uuid REFERENCES rop_calls(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  text            text NOT NULL,
  due_at          timestamptz,
  status          text NOT NULL DEFAULT 'open',
  severity        text DEFAULT 'medium',
  evidence        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_deal_facts_deal_thread_idx ON rop_deal_facts (deal_thread_id);
CREATE INDEX IF NOT EXISTS rop_deal_facts_company_status_idx ON rop_deal_facts (company_id, status);

-- rop_calls: денормализация лучшей привязки для быстрых выборок дашборда
ALTER TABLE rop_calls ADD COLUMN IF NOT EXISTS connector_id uuid REFERENCES rop_channel_connectors(id) ON DELETE SET NULL;
ALTER TABLE rop_calls ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES rop_counterparties(id) ON DELETE SET NULL;
ALTER TABLE rop_calls ADD COLUMN IF NOT EXISTS deal_thread_id uuid REFERENCES rop_deal_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS rop_calls_connector_idx ON rop_calls (connector_id) WHERE connector_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_calls_counterparty_idx ON rop_calls (counterparty_id) WHERE counterparty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rop_calls_deal_thread_idx ON rop_calls (deal_thread_id) WHERE deal_thread_id IS NOT NULL;
