-- 152-ФЗ: журнал согласий (cookie-баннер, согласие на обработку ПДн, согласие
-- на рекламную рассылку). Пишется публичным POST /api/consent. Читается на
-- /admin/platform/consent-log (owner-only).
CREATE TABLE IF NOT EXISTS consent_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES users(id) ON DELETE SET NULL,
  visitor_id        text,
  consent_type      text NOT NULL,
  action            text NOT NULL,
  document_version  text NOT NULL,
  details           jsonb,
  ip_address        text,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_log_created_idx ON consent_log(created_at);
CREATE INDEX IF NOT EXISTS consent_log_user_idx ON consent_log(user_id);
CREATE INDEX IF NOT EXISTS consent_log_visitor_idx ON consent_log(visitor_id);
CREATE INDEX IF NOT EXISTS consent_log_type_idx ON consent_log(consent_type);
