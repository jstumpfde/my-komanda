-- migration 0277: AI-РОП (перенос call-agent)
-- Схема БД модуля AI-РОП (docs/architecture/AI-ROP-MODULE-PLAN-2026-07.md):
-- перенос продукта call-agent (БД `callagent` на радаре) внутрь my-komanda.
-- Идемпотентная (CREATE ... IF NOT EXISTS). Отличия от оригинала — см.
-- комментарий в lib/db/schema.ts перед блоком "AI-РОП (перенос call-agent)".

-- Per-company настройки AI-РОП
CREATE TABLE IF NOT EXISTS rop_settings (
  company_id                  uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  bitrix_webhook_url          text,
  bitrix_inbound_token        text,
  dry_run_crm                 boolean NOT NULL DEFAULT true,
  dry_run_messages            boolean NOT NULL DEFAULT true,
  analysis_model              text,
  glossary                    text,
  discrepancy_enabled         boolean DEFAULT false,
  discrepancy_recipient_mode  text DEFAULT 'manager',
  discrepancy_admin_user_ids  text,
  discrepancy_action_mode     text DEFAULT 'manual',
  discrepancy_custom_fields   text,
  discrepancy_severity_min    text DEFAULT 'medium',
  settings                    jsonb DEFAULT '{}',
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- Менеджеры Bitrix (составной PK — per-tenant natural key)
CREATE TABLE IF NOT EXISTS rop_managers (
  tenant_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bitrix_manager_id      text NOT NULL,
  user_id                uuid REFERENCES users(id) ON DELETE SET NULL,
  name                   text,
  email                  text,
  is_active              boolean NOT NULL DEFAULT true,
  default_product        text,
  crm_sync_enabled       boolean NOT NULL DEFAULT false,
  excluded_from_reports  boolean DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, bitrix_manager_id)
);
CREATE INDEX IF NOT EXISTS rop_managers_user_idx ON rop_managers (user_id);

-- Центральная таблица звонков/взаимодействий
CREATE TABLE IF NOT EXISTS rop_calls (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id                uuid REFERENCES users(id) ON DELETE SET NULL,
  channel                text NOT NULL DEFAULT 'bitrix_telephony',
  type                   text NOT NULL DEFAULT 'call',
  bitrix_call_id         text,
  bitrix_deal_id         text,
  bitrix_lead_id         text,
  bitrix_contact_id      text,
  bitrix_activity_id     text,
  manager_id             text,
  manager_name           text,
  client_phone           text,
  direction              text,
  started_at             timestamptz,
  duration_sec           integer NOT NULL DEFAULT 0,
  recording_url          text,
  recording_path         text,
  status                 text NOT NULL DEFAULT 'pending',
  error                  text,
  attempts               integer NOT NULL DEFAULT 0,
  detected_product       text,
  deal_context_json      jsonb,
  interaction_type       text NOT NULL DEFAULT 'call',
  content_text           text,
  bitrix_deal_title      text,
  bitrix_lead_title      text,
  bitrix_contact_name    text,
  bitrix_portal_url      text,
  lead_status_id         text,
  lead_opportunity       numeric,
  deal_stage_id          text,
  deal_opportunity       numeric,
  crm_outcome_synced_at  timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rop_calls_tenant_bitrix_call_uniq UNIQUE (tenant_id, bitrix_call_id)
);
CREATE INDEX IF NOT EXISTS rop_calls_tenant_idx ON rop_calls (tenant_id);
CREATE INDEX IF NOT EXISTS rop_calls_tenant_started_idx ON rop_calls (tenant_id, started_at);
CREATE INDEX IF NOT EXISTS rop_calls_tenant_status_idx ON rop_calls (tenant_id, status);
CREATE INDEX IF NOT EXISTS rop_calls_status_attempts_retry_idx ON rop_calls (status, attempts)
  WHERE status IN ('failed', 'no_recording');
CREATE INDEX IF NOT EXISTS rop_calls_manager_idx ON rop_calls (manager_id);
CREATE INDEX IF NOT EXISTS rop_calls_tenant_manager_idx ON rop_calls (tenant_id, manager_id);
CREATE INDEX IF NOT EXISTS rop_calls_started_at_idx ON rop_calls (started_at);
CREATE INDEX IF NOT EXISTS rop_calls_lead_status_idx ON rop_calls (tenant_id, lead_status_id)
  WHERE lead_status_id IS NOT NULL;

-- Транскрипт (PK = call_id)
CREATE TABLE IF NOT EXISTS rop_transcripts (
  call_id        uuid PRIMARY KEY REFERENCES rop_calls(id) ON DELETE CASCADE,
  text           text NOT NULL,
  segments_json  jsonb,
  dialogue_json  jsonb,
  language       text,
  model          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- AI-разбор (PK = call_id)
CREATE TABLE IF NOT EXISTS rop_analyses (
  call_id                 uuid PRIMARY KEY REFERENCES rop_calls(id) ON DELETE CASCADE,
  summary                 text,
  sentiment                text,
  manager_score            double precision,
  script_compliance        double precision,
  next_action              text,
  objections_json          jsonb,
  topics_json              jsonb,
  checklist_scores_json    jsonb,
  client_name              text,
  detected_product         text,
  raw_json                 jsonb,
  model                    text,
  coaching_tips_json       jsonb,
  call_stage               text,
  rop_notes_json           jsonb,
  callback_agreed          boolean NOT NULL DEFAULT false,
  callback_phrase          text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- Скрипты продаж + чек-листы
CREATE TABLE IF NOT EXISTS rop_sales_scripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  product         text,
  direction       text NOT NULL DEFAULT 'all',
  content_md      text NOT NULL DEFAULT '',
  checklist_json  jsonb DEFAULT '[]',
  key_phrases     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_sales_scripts_tenant_idx ON rop_sales_scripts (tenant_id);

-- Расхождения карточки CRM vs транскрипт
CREATE TABLE IF NOT EXISTS rop_discrepancies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_id               uuid NOT NULL REFERENCES rop_calls(id) ON DELETE CASCADE,
  entity_type           text,
  entity_id             text,
  field_name            text NOT NULL,
  field_label           text,
  card_value            text,
  transcript_evidence   text,
  suggested_value       text,
  severity              text NOT NULL,
  status                text NOT NULL DEFAULT 'pending',
  routed_to_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  ai_model              text,
  created_at            timestamptz DEFAULT now(),
  resolved_at           timestamptz,
  resolved_by_user_id   uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS rop_discrepancies_tenant_idx ON rop_discrepancies (tenant_id);
CREATE INDEX IF NOT EXISTS rop_discrepancies_call_idx ON rop_discrepancies (call_id);
CREATE INDEX IF NOT EXISTS rop_discrepancies_routed_idx ON rop_discrepancies (routed_to_user_id, status);
CREATE INDEX IF NOT EXISTS rop_discrepancies_tenant_status_idx ON rop_discrepancies (tenant_id, status, created_at DESC);

-- Журнал записей в CRM (идемпотентность через idempotency_key)
CREATE TABLE IF NOT EXISTS rop_crm_write_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  call_id          uuid NOT NULL REFERENCES rop_calls(id) ON DELETE CASCADE,
  action           text NOT NULL,
  entity_type      text,
  entity_id        text,
  mode             text NOT NULL,
  status           text NOT NULL,
  payload_json     jsonb NOT NULL,
  result_json      jsonb,
  idempotency_key  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_crm_log_call_idx ON rop_crm_write_log (call_id, action);
CREATE INDEX IF NOT EXISTS rop_crm_log_idemp_idx ON rop_crm_write_log (idempotency_key);
CREATE INDEX IF NOT EXISTS rop_crm_log_tenant_at_idx ON rop_crm_write_log (tenant_id, created_at);

-- Автонапоминания менеджерам (перенос reminders_auto)
CREATE TABLE IF NOT EXISTS rop_reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  bitrix_manager_id  text,
  call_id            uuid REFERENCES rop_calls(id) ON DELETE SET NULL,
  title              text NOT NULL,
  due_at             timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'pending',
  source             text NOT NULL DEFAULT 'auto',
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);
CREATE INDEX IF NOT EXISTS rop_reminders_tenant_idx ON rop_reminders (tenant_id);
CREATE INDEX IF NOT EXISTS rop_reminders_call_idx ON rop_reminders (call_id);
CREATE INDEX IF NOT EXISTS rop_reminders_due_idx ON rop_reminders (due_at, status);
CREATE INDEX IF NOT EXISTS rop_reminders_manager_status_idx ON rop_reminders (bitrix_manager_id, status, due_at);

-- Расписания автоотчётов в Bitrix IM
CREATE TABLE IF NOT EXISTS rop_report_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  scope            text NOT NULL,
  manager_id       text,
  recipient_kind   text NOT NULL,
  recipient_id     text NOT NULL,
  recipient_name   text,
  frequency        text NOT NULL,
  time_hhmm        text NOT NULL,
  days_of_week     text,
  period_kind      text NOT NULL DEFAULT 'yesterday',
  enabled          boolean DEFAULT true,
  last_run_at      timestamptz,
  last_run_status  text,
  last_run_error   text,
  next_run_at      timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_report_schedules_tenant_idx ON rop_report_schedules (tenant_id);
CREATE INDEX IF NOT EXISTS rop_report_schedules_due_idx ON rop_report_schedules (enabled, next_run_at);

-- Бюджет-гард: события расхода
CREATE TABLE IF NOT EXISTS rop_usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  units       integer NOT NULL,
  call_id     uuid REFERENCES rop_calls(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_usage_tenant_kind_at_idx ON rop_usage_events (tenant_id, kind, created_at);

-- Токен-биллинг: журнал начислений/списаний
CREATE TABLE IF NOT EXISTS rop_token_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  delta       integer NOT NULL,
  reason      text NOT NULL,
  ref_call_id uuid REFERENCES rop_calls(id) ON DELETE SET NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_token_ledger_tenant_idx ON rop_token_ledger (tenant_id, created_at);

-- ── Биллинг-каталог AI-РОП (платформенный уровень) ──────────────────────────

CREATE TABLE IF NOT EXISTS rop_plans (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  price_monthly    integer NOT NULL,
  price_annual     integer,
  calls_limit      integer NOT NULL,
  managers_limit   integer,
  tokens_included  integer,
  features_json    jsonb,
  active           boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rop_promos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  description   text,
  discount_pct  integer DEFAULT 0,
  bonus_calls   integer DEFAULT 0,
  bonus_tokens  integer DEFAULT 0,
  uses_count    integer DEFAULT 0,
  max_uses      integer,
  active        boolean DEFAULT true,
  expires_at    timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rop_referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL UNIQUE,
  name                text,
  created_by_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  tenant_id           uuid REFERENCES companies(id) ON DELETE SET NULL,
  uses_count          integer DEFAULT 0,
  max_uses            integer,
  discount_pct        integer DEFAULT 0,
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_referrals_tenant_idx ON rop_referrals (tenant_id);

CREATE TABLE IF NOT EXISTS rop_partners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text,
  contact         text,
  commission_pct  integer DEFAULT 10,
  ref_code        text UNIQUE,
  clients_count   integer DEFAULT 0,
  revenue_total   integer DEFAULT 0,
  status          text DEFAULT 'active',
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rop_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES companies(id) ON DELETE SET NULL,
  tenant_name     text,
  amount          integer NOT NULL,
  currency        text DEFAULT 'RUB',
  plan            text,
  status          text DEFAULT 'pending',
  payment_method  text,
  external_id     text,
  period_from     date,
  period_to       date,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_payments_tenant_idx ON rop_payments (tenant_id);

CREATE TABLE IF NOT EXISTS rop_billing_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  mark       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rop_billing_reminders_uniq UNIQUE (tenant_id, kind, mark)
);

-- Кластеры возражений (PK = tenant_id, один снимок на тенанта)
CREATE TABLE IF NOT EXISTS rop_objection_clusters (
  tenant_id    uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  map_json     jsonb NOT NULL,
  computed_at  timestamptz NOT NULL DEFAULT now()
);

-- Журнал просмотров публичного дашборда/отчёта
CREATE TABLE IF NOT EXISTS rop_report_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token       text NOT NULL,
  viewer_id   text,
  kind        text NOT NULL DEFAULT 'dashboard',
  ip          text,
  user_agent  text,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rop_report_views_tenant_idx ON rop_report_views (tenant_id, viewed_at);
CREATE INDEX IF NOT EXISTS rop_report_views_viewer_idx ON rop_report_views (viewer_id, viewed_at);

-- Публичная ссылка на дашборд AI-РОП (по образцу report_shares у HR-отчёта)
CREATE TABLE IF NOT EXISTS rop_report_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token       text NOT NULL UNIQUE,
  company_id  uuid NOT NULL,
  created_by  uuid,
  created_at  timestamptz DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS rop_report_shares_company_idx ON rop_report_shares (company_id);
